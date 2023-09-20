import { firebaseConfig } from '../Authentication/FirebaseAdmin/serviceAccountKey'

const credentialsString = JSON.stringify(firebaseConfig)

console.log(`GOOGLE_APPLICATION_CREDENTIALS_JSON='${credentialsString}'`)
