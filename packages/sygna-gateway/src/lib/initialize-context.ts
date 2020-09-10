import { GatewayContext } from '../types';
import $ from '../config';
import axios from 'axios';

const sygnaBridgeUtil = require("@sygna/bridge-util")

export default async (): Promise<GatewayContext> => {
  const signedUpdateUrlRequest = sygnaBridgeUtil.crypto.signObject({
    vasp_code: $.GATEWAY_VASP_CODE,
    callback_permission_request_url: `${$.SELF_ENDPOINT_URL}/transaction/permission-request`,
    callback_validate_addr_url: `${$.SELF_ENDPOINT_URL}/transaction/validate-address`,
    callback_txid_url: `${$.SELF_ENDPOINT_URL}/transaction/txid`,
  }, $.PRIVATE_KEY)

  await axios.post(`${$.BRIDGE_BASE_URL}/vasp/beneficiary-endpoint-url`, signedUpdateUrlRequest, {
    headers: { 'x-api-key': $.API_KEY },
  });

  return {
    apiKey: $.API_KEY,
    privateKey: $.PRIVATE_KEY,
  };
};
