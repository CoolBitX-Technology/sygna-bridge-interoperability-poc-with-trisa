import { randomBytes } from 'crypto';
import axios from 'axios';
import { CustomKoaContext } from '../../types';
import config from '../../config';

const { crypto: bridgeCrypto } = require('@sygna/bridge-util');

export default async (ctx: CustomKoaContext): Promise<number> => {
  // i am originator
  // call post txid to respond
  const requestBody = ctx.request.body;
  const connectionManager = ctx.connMgr!;
  const bridgeBaseUrl = config.BRIDGE_BASE_URL;

  // send transaction confirm to trisa vasp
  connectionManager.resolvePermission(requestBody.transfer_id, requestBody.permission_status)

  const signedTxid = bridgeCrypto.signTxId(
    {
      transfer_id: requestBody.transfer_id,
      // TRISA does not return txid so we will just fake it
      txid: randomBytes(64).toString('hex'),
    },
    connectionManager.getContext().privateKey,
  );

  try {
    await axios.post(`${bridgeBaseUrl}/transaction/txid`, signedTxid, {
      headers: { 'x-api-key': connectionManager.getContext().apiKey },
    });
    console.log(
      `Respond to permission of transfer_id: ${requestBody.transfer_id}`,
    );
  } catch (error) {
    console.log(`Post txid fail, server response ${JSON.stringify(error.response.data, null, 2)}`);
  }

  return (ctx.status = 200);
};
