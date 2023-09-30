import { Document, model, Schema } from 'mongoose'

export interface IMessage {
  _id: string
  chat_id: string
  user_id: string
  content: string
  type: 'text' | 'file'
  createdAt: Date
  updatedAt: Date
}

export interface IMessageDocument extends IMessage, Document {
  _id: string
}

const messageSchema = new Schema<IMessageDocument, IMessageDocument>({
  _id: {
    type: String,
    required: true,
  },
  chat_id: {
    type: String,
    required: true,
  },
  user_id: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    required: true,
  },
  updatedAt: {
    type: Date,
    required: true,
  },
})

export default model<IMessageDocument>('Message', messageSchema)
