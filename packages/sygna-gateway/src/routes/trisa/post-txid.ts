import { CustomKoaContext } from '../../types';

// do nothing on receive txid
export default async (ctx: CustomKoaContext): Promise<number> =>
  (ctx.status = 200);
