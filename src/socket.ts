import { Server, Socket } from "socket.io";
import express, { Request } from "express";
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

const io = new Server(httpServer, {
  cors: {
    origin: [
      "https://site-production-838a.up.railway.app",
      "https://backend-production-a1af.up.railway.app"
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

chatNamespace.on('connection', (socket: Socket) => {
  console.log('User connected to chat:', socket.id, socket.data.user);

  socket.on('message', (msg: string) => {
    // Broadcast the message to other clients in the /chat namespace
    chatNamespace.emit('message', { user: socket.data.user.email, msg });
  });
});


httpServer.listen(PORT, () => {
  console.log(
    chalk.greenBright.bold(
      `✔ ServerSocket started at ${chalk.underline.white(
        `http://localhost:${PORT}`,
      )}`,
    ),
  )
});
