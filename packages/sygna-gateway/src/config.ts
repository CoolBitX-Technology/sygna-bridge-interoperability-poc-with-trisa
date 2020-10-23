import fs from 'fs'
import { Config } from './types';

const configStr = fs.readFileSync(process.argv[2] || './config.json').toString()
const $: Config = JSON.parse(configStr)

// read certificate and private key
const certificate = fs.readFileSync($.gateway.tls.certificateFile).toString();
const rsaPrivateKey = fs.readFileSync($.gateway.tls.privateKeyFile).toString();

export default {
  API_KEY: $.sygna.apiKey,
  PRIVATE_KEY: $.sygna.privateKey,
  BRIDGE_BASE_URL: `https://${$.sygna.stage}-api.sygna.io/${$.sygna.apiVersion}/bridge`,
  GATEWAY_VASP_CODE: $.gateway.vaspCode,
  SELF_ENDPOINT_URL: $.gateway.endpoint.replace(/\/$/, ""),
  TRISA_VASP_ENDPOINT: `${$.trisa.server.endpoint}:${$.trisa.server.grpcApiPort}`,
  REST_API_PORT: $.gateway.restApiPort,
  GRPC_API_PORT: $.gateway.grpcApiPort,
  GRPC_TLS: $.gateway.tls,
  TLS_CERTIFICATE: certificate,
  TLS_PRIVATE_KEY: rsaPrivateKey
}