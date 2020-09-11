import Koa from 'koa';
import Router from 'koa-router';
import bodyparser from 'koa-bodyparser';

import {
  postPermission,
  postPermissionRequest,
  postTxid,
  postValidateAddress,
} from '../routes';
import { CustomKoaContext } from '../types'
import ConnectionManager from '../lib/connection-manager';
import $ from '../config'

const app = new Koa();
const router = new Router();

export const startRestServer = async (connMgr: ConnectionManager) => {
  router
    .post(
      '/transaction/permission-request',
      postPermissionRequest,
    )
    .post('/transaction/permission', postPermission)
    .post(
      '/transaction/validate-address',
      postValidateAddress,
    )
    .post('/transaction/txid', postTxid);

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
    const logResponse = {
      response: ctx.response,
      status: ctx.status,
      path: ctx.request.url,
      method: ctx.request.method,
      body: ctx.body,
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
