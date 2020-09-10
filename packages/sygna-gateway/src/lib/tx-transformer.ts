import { Identity as SygnaIdentity } from "../generated/trisa/identity/sygna/v1alpha1/identity_pb"
import { Transaction, TransactionData } from "../generated/trisa/protocol/v1alpha1/trisa_pb"
import { Any as ProtoAny } from "google-protobuf/google/protobuf/any_pb";
import { Data as BitcoinData } from "../generated/trisa/data/bitcoin/v1alpha1/bitcoin_pb"
import { PermissionRequest, PermissionRequestCallback, PermissionRequestData } from '../types'
import { randomBytes } from "crypto";
import { aes256gcmDecrypt, aes256gcmEncrypt, hmacSha256 } from "./utils";
import $ from '../config'

const { crypto: bridgeCrypto } = require('@sygna/bridge-util');


export const sygnaTxToTrisa = (id: string, tx: PermissionRequestData): Transaction => {
  // only bitcoin for now
  if (tx.transaction.currency_id !== 'sygna:0x80000000') {
    throw Error("only bitcoin for now")
  }

  if (tx.transaction.originator_vasp.addrs.length !== 1) {
    throw Error("only 1 addr for now")
  }

  if (tx.transaction.beneficiary_vasp.addrs.length !== 1) {
    throw Error("only 1 addr for now")
  }

  const sygnaIdentity = new SygnaIdentity()
  sygnaIdentity.setOriginatorVaspCode(tx.transaction.originator_vasp.vasp_code)
  sygnaIdentity.setBeneficiaryVaspCode(tx.transaction.beneficiary_vasp.vasp_code)
  sygnaIdentity.setEncryptedIdentity(Buffer.from(tx.private_info, 'hex'))
  const anySygnaIdentity = new ProtoAny()
  anySygnaIdentity.setValue(sygnaIdentity.serializeBinary())
  anySygnaIdentity.setTypeUrl('type.googleapis.com/trisa.identity.sygna.v1alpha1.Identity')

  const blockchainData = new BitcoinData()
  // blockchainData.setAmount(parseFloat(tx.transaction.amount))
  blockchainData.setAmount(100)
  blockchainData.setSource(tx.transaction.originator_vasp.addrs[0].address)
  blockchainData.setDestination(tx.transaction.beneficiary_vasp.addrs[0].address)
  const anyBlockchainTxData = new ProtoAny()
  anyBlockchainTxData.setValue(blockchainData.serializeBinary())
  anyBlockchainTxData.setTypeUrl('type.googleapis.com/trisa.data.bitcoin.v1alpha1.Data')

  const sygnaTxData = new TransactionData()
  sygnaTxData.setIdentity(anySygnaIdentity)
  sygnaTxData.setData(anyBlockchainTxData)

  // also do encryption here
  const sygnaTx = new Transaction()
  sygnaTx.setId(id)

  // dealt with encryption
  const encryptionKey = new Uint8Array(randomBytes(32))
  const { cipherText, nonce } = aes256gcmEncrypt(encryptionKey, sygnaTxData.serializeBinary())
  sygnaTx.setEncryptionAlgorithm("AES256_GCM")
  sygnaTx.setEncryptionKey(encryptionKey)
  sygnaTx.setTransaction(Buffer.concat([cipherText, nonce]))

  sygnaTx.setHmacAlgorithm("HMAC_SHA256")
  sygnaTx.setHmacSecret(encryptionKey)
  sygnaTx.setHmac(hmacSha256(encryptionKey, cipherText))

  return sygnaTx
}

export const trisaTxToSygna = (tx: Transaction, privateKey: string): PermissionRequest => {
  // validate hmac and decrypt
  const encryptionKey = tx.getEncryptionKey() as Uint8Array
  const encryptedTxData = tx.getTransaction() as Uint8Array
  const calculatedHmac = hmacSha256(encryptionKey, encryptedTxData.slice(0, -12))
  const providedHmac = tx.getHmac() as Uint8Array

  if (calculatedHmac.toString() !== providedHmac.toString()) {
    throw Error("Hmac mismatch")
  }

  const decryptedTxData = aes256gcmDecrypt(encryptionKey, encryptedTxData)
  const txData = TransactionData.deserializeBinary(decryptedTxData)
  const txDataIdentity = txData.getIdentity()!.getValue() as Uint8Array

  const sygnaId = SygnaIdentity.deserializeBinary(txDataIdentity)
  const sygnaIdCipherText = sygnaId.getEncryptedIdentity() as Uint8Array

  const blockchainDataAny = txData.getData() as ProtoAny
  const bitcoinBlockcahindata = BitcoinData.deserializeBinary(blockchainDataAny.getValue() as Uint8Array)

  const now = new Date()
  const sygnaTx: PermissionRequestData = {
    expire_date: now.getTime() + 86400 * 1000,
    private_info: Buffer.from(sygnaIdCipherText).toString('hex'),
    transaction: {
      originator_vasp: {
        vasp_code: sygnaId.getOriginatorVaspCode(),
        addrs: [{ address: bitcoinBlockcahindata.getSource(), addr_extra_info: [] }]
      },
      beneficiary_vasp: {
        vasp_code: sygnaId.getBeneficiaryVaspCode(),
        addrs: [{ address: bitcoinBlockcahindata.getDestination(), addr_extra_info: [] }]
      },
      amount: `${bitcoinBlockcahindata.getAmount()}`,
      currency_id: 'sygna:0x80000000'
    },
    need_validate_addr: false,
    signature: "",
    data_dt: now
  }

  // sign transformed tx with gateway private key
  const signedPermReq = bridgeCrypto.signPermissionRequest(sygnaTx, privateKey)
  const signedCallback = bridgeCrypto.signCallBack({
    callback_url: `${$.SELF_ENDPOINT_URL}/transaction/permission`,
    signature: ""
  } as PermissionRequestCallback, privateKey)

  return {
    data: signedPermReq,
    callback: signedCallback
  }
}