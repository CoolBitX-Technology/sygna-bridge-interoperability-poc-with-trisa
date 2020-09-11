require('dotenv').config()

import { startGrpcServer } from './server'
import { startRestServer } from './server'
import { ConnectionManager } from './lib'

(async () => {
  const connMgr = await ConnectionManager.initialize()

  await startGrpcServer(connMgr)
  await startRestServer(connMgr)
})()