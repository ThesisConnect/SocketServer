import * as dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

dotenv.config()

const credent = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON!

const credentials = JSON.parse(credent)

fs.writeFileSync(
  path.join(__dirname, '../Authentication/FirebaseAdmin/serviceAccountKey.ts'),
  `export const firebaseConfig = ${JSON.stringify(credentials)};`,
)
