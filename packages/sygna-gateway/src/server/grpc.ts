import * as grpc from "@grpc/grpc-js"
import { loadServerCredential } from '../lib/utils'
import * as SygnaGatewayGrpcPb from '../generated/trisa/protocol/v1alpha1/trisa_grpc_pb'
import ConnectionManager from '../lib/connection-manager'
import { Transaction } from "../generated/trisa/protocol/v1alpha1/trisa_pb"
import $ from '../config'

const SERVICE_PATH = 'trisa.protocol.v1alpha1.TrisaPeer2Peer'

export const startGrpcServer = async (connMgr: ConnectionManager) => {
  const server = new grpc.Server();
  //@ts-ignore
  server.addService(SygnaGatewayGrpcPb[SERVICE_PATH], {
    transactionStream: (call: grpc.ServerDuplexStream<Transaction, Transaction>) => {
      call.on("data", (data: Transaction) => {
        connMgr.handleServerEvent(call, data)
      })
      call.on("end", () => {
        console.log("grpc data end!")
        call.end()
      })
    }
  });
  server.bindAsync(`0.0.0.0:${$.GRPC_API_PORT}`, await loadServerCredential(), (error) => {
    if (error) console.error(error)
    else {
      server.start();
      console.log("grpc server started")
    }
  });
}