import { CustomKoaContext } from '../../types';
import $ from '../../config';

const { crypto: bridgeCrypto } = require('@sygna/bridge-util');

// do nothing on receive txid
export default async (ctx: CustomKoaContext): Promise<void> => {
  if (
    ctx.request.body.vasp_code != $.GATEWAY_VASP_CODE ||
    !ctx.request.body.address ||
    ctx.request.body.address.length == 0 ||
    !ctx.request.body.signature
  ) {
    // bad request
    ctx.status = 400;
    return;
  }

  const validateBody: {
    vasp_code: string;
    address: string[];
    signature: string;
  } = ctx.request.body;

  const signedResponse = bridgeCrypto.signObject(
    {
      vasp_code: $.GATEWAY_VASP_CODE,
      address: validateBody.address,
      // will reply false anyway, as we don't know trisa vasp's client address
      is_valid: false,
    },
    ctx.connMgr!.getContext().privateKey,
  );

  ctx.status = 200;
  return (ctx.body = signedResponse);
};
