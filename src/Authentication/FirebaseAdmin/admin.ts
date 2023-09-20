import * as admin from 'firebase-admin'
import { firebaseConfig } from './serviceAccountKey'

const firebaseAdmin = admin.initializeApp({
  credential: admin.credential.cert(firebaseConfig as admin.ServiceAccount),
  storageBucket: 'thesisconect.appspot.com',
})

export default firebaseAdmin
