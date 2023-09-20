import cryto from 'crypto'

export default function generateKey(): string {
  return cryto.randomBytes(32).toString('hex')
}

console.log(generateKey())
