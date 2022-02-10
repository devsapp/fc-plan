import { lodash as _ } from '@serverless-devs/core';
import Diff from '../diff';
import { isAutoConfig } from '../utils';

export default abstract class PlanDeployBase {
  region: string;
  serviceName: string;
  functionName: string;
  service: any;
  functionConfig: any;
  triggers: any;
  customDomains: any;

  fcClient: any;
  accountId: string;

  constructor(localConfig, fcClient) {
    const {
      region,
      service,
      function: functionConfig,
      triggers,
      customDomains,
    } = localConfig;

    this.fcClient = fcClient;
    this.accountId = fcClient?.accountid;

    this.region = region;
    this.service = service;
    this.functionConfig = functionConfig;
    this.triggers = triggers;
    this.customDomains = customDomains;
    this.serviceName = this.service?.name;
    this.functionName = this.functionConfig?.name;
  }

  abstract getPlan();

  isAutoConfig = isAutoConfig

  clearInvalidField(data, invalidKeys) {
    const d = _.omit(data, invalidKeys);
    const notIgnoreKeys = ['description'];
    return _.pickBy(d, (value: any, key: string) => notIgnoreKeys.includes(key) || (!_.isNil(value) && value !== ''));
  }

  objectDeepTransfromString(source) {
    if (_.isArray(source)) {
      return source.map((value) => {
        if (typeof value === 'object') {
          return this.objectDeepTransfromString(value);
        }
        return value?.toString();
      });
    }
  
    if (_.isObject(source)) {
      return _.mapValues(source, (value) => {
        if (typeof value === 'object') {
          return this.objectDeepTransfromString(value);
        }
        // @ts-ignore 不是 object 类型尝试 toString 强制转换为字符串
        return value?.toString();
      });
    }
  
    return source;
  }

  diff(remote, local) {
    return Diff.diff(remote, local);
  }
}