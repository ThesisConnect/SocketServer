import {
  Document,
  Model,
  model,
  Schema,
  SchemaTimestampsConfig,
} from 'mongoose'
import { uuidv4 } from '@firebase/util'

export interface IMessage {
  _id: string
  user_id: string
  content: string
  type: 'text' | 'file'
}

interface IMessageDocument extends IMessage, Document, SchemaTimestampsConfig {
  _id: string
}

export interface IChat {
  _id: string
  messages: IMessage[]
}

interface IChatDocument extends IChat, Document, SchemaTimestampsConfig {
  _id: string
}

type IChatModel = Model<IChatDocument>
const chatSchema = new Schema<IChatDocument, IChatDocument>(
  {
    _id: {
      type: String,
      default: () => uuidv4(),
    },
    messages: {
      type: [
        {
          _id: {
            type: String,
            default: () => uuidv4(),
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
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
)

export default model<IChatDocument, IChatModel>('Chat', chatSchema)
