import {
  Document,
  Model,
  model,
  Schema,
  SchemaTimestampsConfig,
} from 'mongoose'
import { uuidv4 } from '@firebase/util'

export interface IFile {
  _id: string
  name: string
  url: string
  size: number
  file_type: string
  memo?: string
}

export interface IFileDocument extends IFile, Document, SchemaTimestampsConfig {
  _id: string
}

type IFileModel = Model<IFileDocument>
const fileSchema = new Schema<IFileDocument, IFileDocument>(
  {
    _id: {
      type: String,
      default: () => uuidv4(),
    },
    name: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    file_type: {
      type: String,
      required: true,
    },
    memo: {
      type: String,
    },
  },
  { timestamps: true },
)

export default model<IFileDocument, IFileModel>('File', fileSchema)
