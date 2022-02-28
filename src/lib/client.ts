import * as core from '@serverless-devs/core';

const _ = core.lodash;

export default class Client {
  region: string;
  access: string;
  credentials: any;
  serverlessProfile: any;
  private fcClient: any;

  constructor(region: string, credentials, access: string, serverlessProfile) {
    this.region = region;
    this.access = access;
    this.credentials = credentials;
    this.serverlessProfile = serverlessProfile;
  }

  async getFcClient() {
    if (_.isEmpty(this.fcClient)) {
      const fcCore = await core.loadComponent('devsapp/fc-core');
      const fcClient = await fcCore.makeFcClient({
        access: this.access,
        credentials: this.credentials,
        region: this.region,
      });

      this.fcClient = fcClient;
    }

    return this.fcClient;
  }
}
