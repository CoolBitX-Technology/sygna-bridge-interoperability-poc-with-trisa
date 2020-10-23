import Koa from 'koa';
import Router from 'koa-router';
import bodyparser from 'koa-bodyparser';

import * as trisaRoute from '../routes/trisa';
import * as netkiRoute from '../routes/netki';

import { CustomKoaContext } from '../types'
import ConnectionManager from '../lib/connection-manager';
import $ from '../config'

const app = new Koa();
const router = new Router();

export const startRestServer = async (connMgr: ConnectionManager) => {
  router
    .post(
      '/trisa/transaction/permission-request',
      trisaRoute.postPermissionRequest,
    )
    .post('/trisa/transaction/permission', trisaRoute.postPermission)
    .post(
      '/trisa/transaction/validate-address',
      trisaRoute.postValidateAddress,
    )
    .post('/trisa/transaction/txid', trisaRoute.postTxid)
    .post(
      '/netki/transaction/permission-request',
      netkiRoute.postPermissionRequest,
    );

  app.use(bodyparser());
  // log every request
  app.use(async (ctx, next) => {
    const logRequest = {
      request: {
        rersource: `${ctx.request.method} ${ctx.request.url}`,
        header: ctx.request.header,
        body: JSON.stringify(ctx.request.body),
      },
    };
    console.log(JSON.stringify(logRequest, null, 2));
    await next();
    const parsedBody = ctx.body instanceof Buffer ? ctx.body.toString("hex") : ctx.body;
    const logResponse = {
      response: ctx.response,
      status: ctx.status,
      path: ctx.request.url,
      method: ctx.request.method,
      body: parsedBody,
    };
    console.log(JSON.stringify(logResponse, null, 2));
  });

  app.use(async (ctx: CustomKoaContext, next) => {
    // attach global gateway context to ctx
    ctx.connMgr = connMgr
    await next()
  })

  app.use(router.routes());
  app.use(router.allowedMethods());

  app.listen(parseInt($.REST_API_PORT), "0.0.0.0", () => {
    console.log("Rest API started")
  })
}
