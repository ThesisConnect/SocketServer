import { Server, Socket } from 'socket.io'
import express, { Request, Response } from 'express'
import { uuidv4 } from '@firebase/util'
import cookieParser from 'cookie-parser'
import Chat, { IMessage } from './models/chat'
import User from './models/user'
import File from './models/file'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import chalk from 'chalk'
import ms from 'ms'
import http from 'http'
import jwtMiddleware from './middleware/jwtMiddleware'
import cookie from 'cookie'

dotenv.config()

const MAX_RETRIES = 10
let retries = 0

const options = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
}

const connectWithRetry = () => {
  return mongoose
    .connect(process.env.DATABASE_URL || '', options)
    .then(() => {
      console.log(chalk.greenBright('✔ Connected to database ✔'))
    })
    .catch((err) => {
      console.error(chalk.redBright('✖ Failed to connect to database:'), err)
      if (retries < MAX_RETRIES) {
        retries++
        const delay = ms('5s')
        console.warn(
          chalk.yellow(
            `⏳ Retry in ${delay / 1000}s... (${retries}/${MAX_RETRIES})`,
          ),
        )
        setTimeout(connectWithRetry, delay)
      } else {
        console.error(chalk.bgRed('✖ Max retries reached. Exiting.'))
        process.exit(1)
      }
    })
}

connectWithRetry()

const app = express()
const PORT = Number(process.env.PORT || 5050)
const httpServer = http.createServer(app)


app.get('/', (req: Request, res: Response) => {
  res.send('<h1>Hello World</h1>')
})

const io = new Server(httpServer, {
  cors: {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
})

const chatNamespace = io.of('/chat')
chatNamespace.use(async (socket, next) => {
  try {
    const cookies = cookie.parse(socket.handshake.headers.cookie || '');
    const token = cookies.session;
    console.log(token)
    if (!token) throw new Error('No token found');
    // ... (Verify the token as in your JWT middleware)
    next();
  } catch (error) {
    console.log(error);
    next(new Error('Authentication error'));
  }
});
// const authMiddleware = (socket: Socket, next: (err?: Error) => void) => {
//   console.log('Authenticating user...')
//   const sessionCookie = socket.handshake.headers.cookie?.split('; ').find(row => row.startsWith('session'))?.split('=')[1];

//   if (sessionCookie) {
//     admin.auth().verifySessionCookie(sessionCookie, true)
//       .then(decodedToken => {
//         if (decodedToken.email_verified === false) {
//           return next(new Error('Email not verified'));
//         }

//         socket.data.user = {
//           uid: decodedToken.uid,
//           email: decodedToken.email,
//         };

//         next();
//       })
//       .catch(error => {
//         console.log(error);
//         next(new Error('Authentication error'));
//       });
//   } else {
//     next(new Error('No token found'));
//   }
// };

// chatNamespace.use(authMiddleware);
// io.engine.use(jwtMiddleware)

interface File {
  name: string
  fileID: string
  size: number
  type_file: string
  lastModified: string
  link: string
  memo?: string
}

interface Message {
  _id: string
  uid: string
  username: string
  content: string | File
  type: 'file' | 'text'
}

let cache: Map<string, Message[]> = new Map() //TODO: Schedule update cached messages to database every one minute

async function SaveCache() {
  try {
    for (const [chatId] of cache) {
      await SaveCacheById(chatId)
    }
    setTimeout(SaveCache, 60 * 1000)
  } catch (err) {
    console.log(err)
  }
}

async function SaveCacheById(chatId: string) {
  try {
    const messages = cache.get(chatId) || []
    if (messages.length == 0) return
    const data = messages.map((Message) => {
      return {
        _id: Message._id,
        user_id: Message.uid,
        content:
          Message.content instanceof File
            ? Message.content.link
            : Message.content,
        type: Message.type,
      }
    })
    await Chat.findByIdAndUpdate(chatId, {
      $addToSet: { messages: data },
    })
  } catch (err) {
    console.log(err)
  }
}

SaveCache()

async function MakeMessageData(messages: IMessage[]): Promise<Message[]> {
  let idToName = new Map<string, string>()
  return (
    await Promise.all(
      messages.map(async (message) => {
        if (!idToName.has(message.user_id)) {
          const user = await User.findById(message.user_id)
          if (user) {
            idToName.set(message.user_id, user.username)
          }
        }
        const name = idToName.get(message.user_id) || ''
        let content: string | File = message.content
        if (message.type === 'file') {
          const file = await File.findById(message.content)
          if (file) {
            content = {
              name: file.name,
              fileID: file._id,
              size: file.size,
              type_file: file.file_type,
              lastModified: file.updatedAt?.toString() || '',
              link: file.url,
              memo: file.memo,
            }
          } else {
            content = 'Unknown file'
          }
        }
        return {
          _id: message._id,
          uid: message.user_id,
          username: name,
          content: content,
          type: message.type,
        }
      }),
    )
  ).filter((message) => message !== undefined)
}

chatNamespace.on('connection', (socket: Socket) => {
  console.log('User connected to chat:', socket.id, socket.data.user)

  socket.on('join room', async (chatId) => {
    console.log('User joined room:', chatId)
    await socket.join(chatId)
    console.log(chatNamespace.adapter.rooms)
    if (!cache.has(chatId)) {
      const data = await Chat.findOne(
        { _id: chatId },
        { messages: { $slice: -30 } },
      )
      if (data) {
        const messages = await MakeMessageData(data.messages)
        cache.set(chatId, messages)
      }
    }
    socket.emit('room messages', cache.get(chatId)?.slice(-30))
  })

  socket.on('leave room', async (chatId) => {
    await socket.leave(chatId)
    console.log('User left room:', chatId)
    if (chatNamespace.adapter.rooms.get(chatId)?.size === 0) {
      await SaveCacheById(chatId)
      cache.delete(chatId)
    }
  })

  socket.on('send message', (chatId, message) => {
    console.log(chatNamespace.adapter.rooms)
    console.log('User sent message:', message)
    const response: Message = {
      _id: uuidv4(),
      uid: 'OU3mOuC6dxg1nPtQKq74Ca9H8hx1',
      username: 'llllllllllllllllllllllllllllll_l',
      content: message,
      type: 'text',
    }
    let messages = cache.get(chatId) || []
    messages.push(response)
    cache.set(chatId, messages)
    chatNamespace.to(chatId).emit('receive message', response)
  })

  socket.on('request messages', async (chatId, timestamp) => {
    const data = await Chat.findOne(
      { _id: chatId}, 
      { 'messages.createdAt': { $lt: new Date(timestamp), $slice: -30 },
    })
    if (data) {
      let messages = cache.get(chatId) || []
      messages.push(...(await MakeMessageData(data.messages)))
      cache.set(chatId, messages)
    }
    socket.emit('room messages', cache.get(chatId)?.slice(-30))
  })

  socket.on('disconnect', () => {
    console.log('User disconnected from chat:', socket.id)
  })
})

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(
    chalk.greenBright.bold(
      `✔ ServerSocket started at ${chalk.underline.white(
        `http://localhost:${PORT}`,
      )}`,
    ),
  )
})
