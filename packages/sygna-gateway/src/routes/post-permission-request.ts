import { CustomKoaContext } from '../types';
import $ from '../config';


export default async (ctx: CustomKoaContext): Promise<number> => {
  const requestBody = ctx.request.body;
  const connectionManager = ctx.connMgr!;

  // first check protocol beneficiary vasp code
  if (
    requestBody.data.transaction.beneficiary_vasp.vasp_code !==
    $.GATEWAY_VASP_CODE
  ) {
    // if this is not for me (beneficiary is not me)
    // return 400 without doing anything
    console.log(
      `Receive unknown vasp_code ${requestBody.data.transaction.beneficiary_vasp.vasp_code}`,
    );
    return (ctx.status = 400);
  }
  // lookup trisa directory
  // PoC: only one
  // forward to trisa node
  // will not wait promise resolve
  connectionManager.sendClientEvent($.TRISA_VASP_ENDPOINT, requestBody.transfer_id, requestBody.data)

  // will do post permission when trisa send back tx

  return (ctx.status = 200);
};
