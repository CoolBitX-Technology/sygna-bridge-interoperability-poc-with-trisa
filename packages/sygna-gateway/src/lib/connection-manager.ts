import * as grpc from "@grpc/grpc-js"
import { Transaction } from "../generated/trisa/protocol/v1alpha1/trisa_pb"
import { loadTrustChain } from './utils'
import * as SygnaGatewayGrpcPb from '../generated/trisa/protocol/v1alpha1/trisa_grpc_pb'
import { GatewayContext, PermissionRequestData, PermissionStatus } from '../types';
import { sygnaTxToTrisa, trisaTxToSygna } from './tx-transformer'
import axios from 'axios'
import $ from "../config"
import { initializeContext } from '.'
const sygnaBridgeUtil = require("@sygna/bridge-util")

const SERVICE_PATH = 'trisa.protocol.v1alpha1.TrisaPeer2Peer'

export default class {
  private connectionMap: Map<string, grpc.ClientDuplexStream<Transaction, Transaction>>
  // always use sygna id!
  // private pendingIdMap: Map<string, Transaction>
  private permissionResolveMap: Map<string, (p: PermissionStatus) => void>

  private constructor(
    private trustChain: grpc.ChannelCredentials,
    private context: GatewayContext
  ) {
    this.connectionMap = new Map()
    // this.pendingIdMap = new Map()
    this.permissionResolveMap = new Map()
  }

  public static async initialize() {
    const trustChain = await loadTrustChain()
    const context = await initializeContext()

    return new this(trustChain, context)
  }

  public getContext() {
    return this.context
  }

  public getClient(endpoint: string): grpc.ClientDuplexStream<Transaction, Transaction> {
    if (this.connectionMap.has(endpoint)) {
      return this.connectionMap.get(endpoint)!
    }

    // connect
    //@ts-ignore
    const trisaGrpcClient = grpc.makeGenericClientConstructor(SygnaGatewayGrpcPb[SERVICE_PATH], "TrisaPeer2PeerService", {})
    const grpcClient = new trisaGrpcClient(endpoint, this.trustChain) as unknown as SygnaGatewayGrpcPb.TrisaPeer2PeerClient
    const stream = grpcClient.transactionStream()
    // stream.on('data', this.handleEvent)
    stream.on('error', (err) => console.log(`[ERROR] [${endpoint}] ${err}`))
    stream.on('exit', () => console.log(`[EXIT] [${endpoint}] Existed!`))

    this.connectionMap.set(endpoint, stream)
    return stream
  }

  public resolvePermission(id: string, permission: PermissionStatus) {
    if (!this.permissionResolveMap.has(id)) {
      console.log(`Attempt to resolve transfer ${id} but does not exist`)
      return
    }

    this.permissionResolveMap.get(id)!(permission)
    this.permissionResolveMap.delete(id)
    console.log(`Transfer ${id} resolved`)
  }

  public async handleServerEvent(stream: grpc.ServerDuplexStream<Transaction, Transaction>, data: Transaction) {
    // this is a transaction request, send post permission request
    console.log(`Incoming TRISA VASP transfer ${data.getId()}`)
    const transformedTx = trisaTxToSygna(data, this.context.privateKey)

    let transferId: string
    try {
      const resp = await axios.post(
        `${$.BRIDGE_BASE_URL}/transaction/permission-request`,
        transformedTx,
        { headers: { 'x-api-key': this.context.apiKey } },
      );
      // this.pendingIdMap.set(transfer_id, data)
      transferId = resp.data.transfer_id
    } catch (error) {
      // exit on error
      stream.end()
      throw Error(`Post perm-req failed: ${error}`)
    }
    console.log(`Post perm-req ok: ${transferId}`)

    // wait beneficiary response
    // TODO: how do I do it
    const beneResponse: PermissionStatus = await new Promise((resolve, reject) => {
      this.permissionResolveMap.set(transferId, resolve)
    })

    if (beneResponse == PermissionStatus.Accepted) {
      // response to trisa ok
      stream.write(data)
    }
    // else do nothing
  }

  public async sendClientEvent(endpoint: string, sygnaId: string, data: PermissionRequestData) {
    // this is a transaction request, send post permission request
    console.log(`Outgoing TRISA VASP transfer ${sygnaId}`)
    const transformedTx = sygnaTxToTrisa(sygnaId, data)

    const stream = this.getClient(endpoint)
    stream.write(transformedTx)

    // wait transaction confirm from trisa vasp
    const confirm: Transaction = await new Promise((res, erj) => {
      stream.once("data", res)
    })

    // validate trisa response
    // TODO: validate logic
    // TODO: timeout
    if (true) {
      const signedPermisson = sygnaBridgeUtil.crypto.signPermission(
        {
          transfer_id: sygnaId,
          expire_date: Date.now() + 86400 * 1000,
          permission_status: PermissionStatus.Accepted,
        },
        this.context.privateKey
      );
      // call post-permission
      await axios.post(
        `${$.BRIDGE_BASE_URL}/transaction/permission`,
        signedPermisson,
        { headers: { 'x-api-key': this.context.apiKey } },
      );
      console.log(`${sygnaId} post permission ok`);
    } else {
      const signedPermisson = sygnaBridgeUtil.crypto.signPermission(
        {
          transfer_id: sygnaId,
          expire_date: Date.now() + 86400 * 1000,
          permission_status: PermissionStatus.Rejected,
          reject_code: "BVRC999",
          reject_message: "TRISA vasp message validation failed"
        },
        this.context.privateKey
      );
      // call post-permission
      await axios.post(
        `${$.BRIDGE_BASE_URL}/transaction/permission`,
        signedPermisson,
        { headers: { 'x-api-key': this.context.apiKey } },
      );
      console.log(`${sygnaId} post permission ok`);
    }
  }
}