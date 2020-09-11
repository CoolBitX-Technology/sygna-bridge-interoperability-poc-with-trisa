import { ServerCredentials, ChannelCredentials } from "@grpc/grpc-js"
import { promises as fs } from 'fs'
import $ from '../config'
import crypto from 'crypto'

const ALGO = 'aes-256-gcm';

export const loadServerCredential = async (): Promise<ServerCredentials> => {
  const certBuffer = await fs.readFile($.GRPC_TLS.certificateFile)
  const keyBuffer = await fs.readFile($.GRPC_TLS.privateKeyFile)
  return ServerCredentials.createSsl(null, [{ cert_chain: certBuffer, private_key: keyBuffer }])
}

export const loadTrustChain = async (): Promise<ChannelCredentials> => {
  const trustChainBuffer = await fs.readFile($.GRPC_TLS.trustChain)
  const certBuffer = await fs.readFile($.GRPC_TLS.certificateFile)
  const keyBuffer = await fs.readFile($.GRPC_TLS.privateKeyFile)
  return ChannelCredentials.createSsl(trustChainBuffer, keyBuffer, certBuffer)
}

export const aes256gcmEncrypt = (key: Uint8Array, message: Uint8Array): { cipherText: Uint8Array, nonce: Uint8Array } => {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const cipherBuffer = cipher.update(message)

  return {
    cipherText: Buffer.concat([cipherBuffer, cipher.final(), cipher.getAuthTag()]),
    nonce: iv
  }
}

export const aes256gcmDecrypt = (key: Uint8Array, message: Uint8Array): Uint8Array => {
  const cipherText = message.slice(0, -28)
  const authTag = message.slice(-28, -12)
  const iv = message.slice(-12)

  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(authTag)
  const decipherBuffer = decipher.update(cipherText)

  return Buffer.concat([decipherBuffer, decipher.final()])
}

export const hmacSha256 = (key: Uint8Array, message: Uint8Array): Uint8Array => {
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(message);
  return new Uint8Array(hmac.digest())
}