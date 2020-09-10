import Koa from 'koa';
import ConnectionManager from './lib/connection-manager';

export type GatewayContext = {
  apiKey: string;
  privateKey: string;
};

// map robot vasp code to data
export type CustomKoaContext = Koa.ParameterizedContext & {
  connMgr?: ConnectionManager;
};

export enum PermissionStatus {
  Accepted = 'ACCEPTED',
  Rejected = 'REJECTED',
}

export type PermissionRequestResponse = {
  permission_status: PermissionStatus;
  reject_code?: string;
  reject_message?: string;
};

type Vasp = {
  vasp_code: string;
  addrs: {
    address: string;
    addr_extra_info: any[];
  }[];
}

export type PermissionRequestData = {
  expire_date: number;
  private_info: string;
  transaction: {
    originator_vasp: Vasp;
    beneficiary_vasp: Vasp;
    currency_id: string;
    amount: string;
  };
  need_validate_addr: boolean;
  data_dt: Date;
  signature: string;
}

export type PermissionRequestCallback = {
  callback_url: string;
  signature: string;
}

export type PermissionRequest = {
  data: PermissionRequestData;
  callback: PermissionRequestCallback;
}

export type Config = {
  sygna: {
    stage: string;
    apiKey: string;
    privateKey: string;
    apiVersion: "v2";
  };
  gateway: {
    endpoint: string;
    vaspCode: string;
    restApiPort: string;
    grpcApiPort: string;
    tls: {
      privateKeyFile: string;
      certificateFile: string;
      trustChain: string;
    }
  };
  trisa: {
    server: {
      endpoint: string;
      restApiPort: string;
      grpcApiPort: string;
    },
  }
}