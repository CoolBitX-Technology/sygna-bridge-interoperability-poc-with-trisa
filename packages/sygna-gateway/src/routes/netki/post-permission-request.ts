import { CustomKoaContext } from '../../types';
import $ from '../../config';


export default async (ctx: CustomKoaContext): Promise<number> => {
  

  return (ctx.status = 200);
};
