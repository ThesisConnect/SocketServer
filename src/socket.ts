import { Server, Socket } from 'socket.io'
import express, { Request, Response } from 'express'
import { uuidv4 } from '@firebase/util'
import Chat from './models/chat'
import User from './models/user'
import user from './models/user'
import File from './models/file'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import chalk from 'chalk'
import ms from 'ms'
import http from 'http'
import cookie from 'cookie'
import admin from './Authentication/FirebaseAdmin/admin'
import Message, { IMessageDocument } from './models/message'
import Folder from './models/folder'

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
    const cookies = cookie.parse(socket.handshake.headers.cookie || '')
    const token = cookies.session
    // console.log('token', token)
    if (!token) throw new Error('No token found')
    const decoded = await admin.auth().verifySessionCookie(token, true)
    if (decoded.email_verified === false) throw new Error('Email not verified!')
    // console.log(decoded)
    if (!decoded) throw new Error('Validation failed!')
    const u = await user.findById(decoded.uid)
    if (!u) throw new Error('Invalid user!')
    socket.data.user = {
      uid: decoded.uid,
      email: decoded.email!,
      username: u.username,
    }
    next()
  } catch (error) {
    console.log(error)
    next(new Error('Authentication error'))
  }
})
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

interface File_front {
  name: string
  fileID: string
  size: number
  type_file: string
  lastModified: string
  link: string
  memo?: string
}

interface Message_front {
  _id: string
  uid: string
  username: string
  content: string | File_front
  type: 'file' | 'text'
  createdAt: Date
  updatedAt: Date
}

let cache: Map<string, Message_front[]> = new Map() //TODO: Schedule update cached messages to database every one minute

async function SaveCache() {
  try {
    for (const [chatId] of cache) {
      await SaveCacheById(chatId)
    }
  } catch (err) {
    console.log(err)
  }
}

async function SaveCacheById(chatId: string) {
  try {
    const data = cache.get(chatId) || []
    if (data.length == 0) return
    let messages = []
    for (const d of data) {
      messages.push({
        _id: d._id,
        chat_id: chatId,
        user_id: d.uid,
        content: typeof d.content !== 'string' ? d.content.fileID : d.content,
        type: d.type,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })
    }
    const chat = await Chat.findById(chatId)
    if (chat) {
      await chat.updateOne({
        $addToSet: {
          messages: messages.map((message) => {
            return message._id
          }),
        },
      })
      try {
        await Message.insertMany(messages, { ordered: false })
      } catch (err) {}
    }
  } catch (err) {}
}

setInterval(SaveCache, 60 * 1000)

async function MakeMessageData(
  messages: IMessageDocument[],
): Promise<Message_front[]> {
  let idToName = new Map<string, string>()
  return (
    await Promise.all(
      messages.map(async (message): Promise<Message_front> => {
        if (!idToName.has(message.user_id)) {
          const user = await User.findById(message.user_id)
          if (user) {
            idToName.set(message.user_id, user.username)
          }
        }
        const name = idToName.get(message.user_id) || ''
        let content: string | File_front = message.content
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
          createdAt: new Date(message.createdAt),
          updatedAt: new Date(message.updatedAt),
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
      const chat = await Chat.findById(chatId)
        .populate<{ messages: IMessageDocument[] }>({
          path: 'messages',
          options: { sort: { 'createdAt': -1 }, limit: 30 }
      })
      if (chat) {
        cache.set(chatId, await MakeMessageData(chat.messages?.reverse() || []))
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

  socket.on('send message', async (chatId, message) => {
    console.log(chatNamespace.adapter.rooms)
    console.log('User sent message:', message)

    let content: string | File_front = message
    if (typeof content !== 'string') {
      content = 'Unknown file'
      const chat = await Chat.findById(chatId)
      if (chat) {
        const folder = await Folder.findById(chat.folder_id)
        if (folder) {
          const result = await File.create({
            _id: message.fileID,
            name: message.name,
            url: message.link,
            size: message.size,
            file_type: message.type_file,
            memo: message.memo,
          })
          if(result){
            const result_folder = await folder.updateOne({
              $addToSet: {
                files: message.fileID,
              },
            })
            if (result_folder) {
              chatNamespace.to(chatId).emit('update folder')
            }
            content = {
              name: message.name,
              fileID: message.fileID,
              size: message.size,
              type_file: message.type_file,
              lastModified: message.lastModified,
              link: message.link,
              memo: message.memo,
            }
          }
        }
      }
    }
    const response: Message_front = {
      _id: uuidv4(),
      uid: socket.data.user.uid,
      username: socket.data.user.username,
      content: content,
      type: (typeof content) === 'string' ? 'text' : 'file' ,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    let messages = cache.get(chatId) || []
    messages.push(response)
    cache.set(chatId, messages)
    chatNamespace.to(chatId).emit('receive message', response)
  })
  socket.on('request messages', async (chatId, timestamp) => {
    await SaveCacheById(chatId)
    const chat = await Chat.findById(chatId)
      .populate<{ messages: IMessageDocument[] }>({
        path: 'messages',
        match: { createdAt: { $lt: new Date(timestamp).toISOString() } },
        options: { sort: { createdAt: 1 }, limit: 30 },
      })
    if (chat) {
      let messages = cache.get(chatId) || []
      messages.push(...(await MakeMessageData(chat.messages)))
      cache.set(chatId, messages)
    }
    socket.emit('more messages', await MakeMessageData(chat?.messages || []) || [])
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
