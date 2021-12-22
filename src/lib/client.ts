import * as core from '@serverless-devs/core';
import _ from 'lodash';


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
      const fcCommon = await core.loadComponent('devsapp/fc-common');
      this.serverlessProfile.props = { region: this.region };
      const fcClient = await fcCommon.makeFcClient(this.serverlessProfile);

      this.fcClient = fcClient;
    }

    return this.fcClient;
  }
}
