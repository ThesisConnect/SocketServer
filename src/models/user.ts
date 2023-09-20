import {
  Document,
  Model,
  model,
  Schema,
  SchemaTimestampsConfig,
} from 'mongoose'

export interface IUser {
  _id: string
  name: string
  surname: string
  username: string
  avatar?: string
  role: 'advisor' | 'advisee'
}

interface IUserDocument extends IUser, Document, SchemaTimestampsConfig {
  _id: string
}

type IUserModel = Model<IUserDocument>
const userSchema = new Schema<IUserDocument, IUserDocument>(
  {
    _id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    surname: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    avatar: {
      type: String,
    },
    role: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
)

export default model<IUserDocument, IUserModel>('User', userSchema)
