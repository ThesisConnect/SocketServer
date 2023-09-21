import {
  Document,
  Model,
  model,
  Schema,
  SchemaTimestampsConfig,
} from 'mongoose'
import { uuidv4 } from '@firebase/util'
import Folder from '../models/folder'
import File from '../models/file'

export interface IFolder {
  _id: string
  name: string
  parent?: string
  child: string[]
  files: string[]
  shared: string[]
}

export interface IFolderDocument
  extends IFolder,
    Document,
    SchemaTimestampsConfig {
  _id: string
}

type IFolderModel = Model<IFolderDocument>
const folderSchema = new Schema<IFolderDocument, IFolderDocument>(
  {
    _id: {
      type: String,
      default: () => uuidv4(),
    },
    name: {
      type: String,
      required: true,
    },
    parent: {
      type: String,
      ref: 'Folder',
      default: null,
    },
    child: {
      type: [String],
      ref: 'Folder',
      default: [],
    },
    files: {
      type: [String],
      ref: 'File',
      default: [],
    },
    shared: {
      type: [String],
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true },
)

folderSchema.pre('deleteOne', { document: true }, async function (next) {
  try {
    for (let file_id of this.files) {
      await File.findByIdAndDelete(file_id)
    }
    for (let child_id of this.child) {
      const childFolder = await Folder.findById(child_id)
      await childFolder?.deleteOne()
    }
    next()
  } catch (error) {
    console.log(error)
  }
})

export default model<IFolderDocument, IFolderModel>('Folder', folderSchema)
