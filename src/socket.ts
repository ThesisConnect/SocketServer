import { Server, Socket } from "socket.io";
import express, { Request, Response } from 'express'
import admin from "./Authentication/FirebaseAdmin/admin"; // Adjust the path to point to your Firebase admin setup
import cookieParser from "cookie-parser";
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import chalk from 'chalk';
import ms from 'ms';
import http from 'http';



dotenv.config();

const MAX_RETRIES = 10;
let retries = 0;

const options = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
};

const connectWithRetry = () => {
  return mongoose
    .connect(process.env.DATABASE_URL || '', options)
    .then(() => {
      console.log(chalk.greenBright('✔ Connected to database ✔'));
    })
    .catch((err) => {
      console.error(chalk.redBright('✖ Failed to connect to database:'), err);
      if (retries < MAX_RETRIES) {
        retries++;
        const delay = ms('5s');
        console.warn(
          chalk.yellow(
            `⏳ Retry in ${delay / 1000}s... (${retries}/${MAX_RETRIES})`,
          ),
        );
        setTimeout(connectWithRetry, delay);
      } else {
        console.error(chalk.bgRed('✖ Max retries reached. Exiting.'));
        process.exit(1);
      }
    });
};

connectWithRetry();

const app = express();
const PORT = Number(process.env.PORT || 5050)
const httpServer = http.createServer(app);

app.use(cookieParser());

app.use(express.json())
app.get('/', (req: Request, res: Response) => {
    res.send('<h1>Hello World</h1>')
})

const io = new Server(httpServer, {
  cors: {
    origin: [
      "https://site-production-838a.up.railway.app",
      "https://backend-production-a1af.up.railway.app",
      "http://localhost:3000" 
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
});

const chatNamespace = io.of('/chat');

const authMiddleware = (socket: Socket, next: (err?: Error) => void) => {
  const sessionCookie = socket.handshake.headers.cookie?.split('; ').find(row => row.startsWith('session'))?.split('=')[1];

  if (sessionCookie) {
    admin.auth().verifySessionCookie(sessionCookie, true)
      .then(decodedToken => {
        if (decodedToken.email_verified === false) {
          return next(new Error('Email not verified'));
        }

        socket.data.user = {
          uid: decodedToken.uid,
          email: decodedToken.email,
        };

        next();
      })
      .catch(error => {
        console.log(error);
        next(new Error('Authentication error'));
      });
  } else {
    next(new Error('No token found'));
  }
};

chatNamespace.use(authMiddleware);

export interface File {
    type: 'file';
    name: string;
    fileID: string;
    size: number;
    type_file: string;
    lastModified: string;
    link: string;
    memo?: string;
}

interface Message {
    id: string;
    username: string;
    content: string | File;
    type?: 'file' | 'text';
}

let cache : Map<string, Message[]> = new Map(); //TODO: Schedule update cached messages to database every one minute

chatNamespace.on('connection', (socket: Socket) => {
  console.log('User connected to chat:', socket.id, socket.data.user);

  socket.on('join room',  (chatId) => {
    socket.join(chatId);
    if (!cache.has(chatId)) {
        cache.set(chatId, []); //TODO: Pull 30 recent messages from database
    }
    socket.emit('room messages', cache.get(chatId)?.slice(-30));
  });

  socket.on('leave room', (chatId) => {
    socket.leave(chatId);
    if (chatNamespace.adapter.rooms.get(chatId)?.size === 0) {
        //TODO: Update cached messages to database
        cache.delete(chatId);
    }
  });

  socket.on('send message', (chatId, message) => {
    const response : Message = {
        id: socket.data.user.uid,
        username: socket.data.user.email,
        content: message,
        type: 'text',
    }
    let messages = cache.get(chatId) || [];
    messages.push(response);
    cache.set(chatId, (messages));
    io.to(chatId).emit('receive message', response);
  });

  socket.on('request messages', (chatId, timestamp) => {
    //TODO: Pull other 30 messages from database that have timestamp less than the timestamp received
    //      then cache and send them back to the client
  });

  socket.on('disconnect', () => {
    console.log('User disconnected from chat:', socket.id);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(
    chalk.greenBright.bold(
      `✔ ServerSocket started at ${chalk.underline.white(
        `http://localhost:${PORT}`,
      )}`,
    ),
  )
});
