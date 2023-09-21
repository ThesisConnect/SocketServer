import {
  Document,
  Model,
  model,
  Schema,
  SchemaTimestampsConfig,
} from 'mongoose'
import { uuidv4 } from '@firebase/util'
import Message from '../models/message'

export interface IChat {
  _id: string
  folder_id: string
  messages: string[]
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
    folder_id: {
      type: String,
      ref: 'Folder',
      required: true,
    },
    messages: {
      type: [String],
      ref: 'Message',
      default: [],
    },
  },
  { timestamps: true },
)

chatSchema.pre('deleteOne', { document: true }, async function (next) {
  try {
    await Message.deleteMany({ chat_id: this._id })
  } catch (err) {
    console.log(err)
  }
})

export default model<IChatDocument, IChatModel>('Chat', chatSchema)
