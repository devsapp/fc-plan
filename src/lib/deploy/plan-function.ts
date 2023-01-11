import * as core from '@serverless-devs/core';
import diff from 'variable-diff';
import logger from '../../common/logger';
import PlanDeployBase from "./plan-base";
const _ = core.lodash;

export const FUNCTION_CONF_DEFAULT = {
  description: 'This is default function description by fc-deploy component',
  runtime: 'nodejs10',
  handler: 'index.handler',
  memorySize: 128,
  timeout: 3,
  instanceConcurrency: 1,
  instanceType: 'e1',
};

const FUNCTION_CUSTOM_HEALTH_CHECK_CONFIG = {
  initialDelaySeconds: 0,
  periodSeconds: 3,
  timeoutSeconds: 1,
  failureThreshold: 1,
  successThreshold: 2,
};

const isCustomContainer = (runtime) => runtime === 'custom-container';
const DEFAULT_CA_PORT = 9000;

export default class PlanFunction extends PlanDeployBase {

  async getPlan() {
    if (_.isEmpty(this.service) || _.isEmpty(this.functionConfig)) {
      logger.debug(`service/function config is empty, skip getFunctionPlan`);
      return {};
    }

    // 获取缓存
    const state = await core.getState(`${this.accountId}-${this.region}-${this.serviceName}-${this.functionName}`);
    // 获取线上配置
    const remote = await this.getFunctionConfig();

    logger.debug(`function local config: ${JSON.stringify(this.functionConfig)}`);
    logger.debug(`function state config: ${state ? JSON.stringify(state) : 'null'}`);
    logger.debug(`function remote config: ${remote ? JSON.stringify(remote) : 'null'}`);

    // TODO: 没有权限
    if (_.isString(remote)) { }
    // 远端不存在：deploy 时不交互
    if (_.isEmpty(remote)) {
      return {
        remote,
        local: this.functionConfig,
        diff: 'remoteNull',
        needInteract: false,
      };
    }

    const { functionPlan, cloneRemote } = await this.transfromConfig(_.cloneDeep({
      remote,
      local: _.defaults(this.functionConfig, FUNCTION_CONF_DEFAULT),
    }));

    // 不对比代码配置
    delete functionPlan.local.codeUri;
    delete functionPlan.local.ossBucket;
    delete functionPlan.local.ossKey;

    // 转化后的线上配置和本地做 diff
    const { changed, text } = diff(cloneRemote, functionPlan.local);

    // 本地缓存和线上配置相等：deploy 时不交互
    if (state?.statefulConfig?.name) {
      delete state?.statefulConfig?.name;
    }

    const localChecksum = state?.statefulConfig?.codeChecksum;
    const removeChecksum = remote?.codeChecksum;
    const codeUpdate = removeChecksum !== localChecksum;
    if (removeChecksum && codeUpdate) {
      functionPlan.codeChecksumDiff = `Code package has changed in other ways(checksum):\nLast local deployment -> Online status:\x1B[33m${localChecksum || null}\x1B[0m -> \x1B[33m${removeChecksum}\x1B[0m`;
    }

    const cState = this.rmCustomContainerConfigAccelerationInfo(state?.statefulConfig || {});
    const cRemote = this.rmCustomContainerConfigAccelerationInfo(remote || {});
    if (cloneRemote.asyncConfiguration) {
      cRemote.asyncConfiguration = cloneRemote.asyncConfiguration;
    }
    functionPlan.needInteract = codeUpdate || (_.isEqual(cState, cRemote) ? false : changed);
    functionPlan.diff = text?.substring(2, text.length - 1);
    logger.debug(`functionPlan needInteract: ${codeUpdate}(codeUpdate), ${changed}(changed), ${functionPlan.needInteract}(functionPlan.needInteract)`);
    logger.debug(`functionPlan diff:\n${text}`);
    logger.debug(`functionPlan codeChecksumDiff:\n${functionPlan.codeChecksumDiff}`);
    functionPlan.plan = this.diff(cloneRemote, functionPlan.local);

    // 回写代码配置
    functionPlan.local.codeUri = this.functionConfig.codeUri;
    functionPlan.local.ossBucket = this.functionConfig.ossBucket;
    functionPlan.local.ossKey = this.functionConfig.ossKey;
    return functionPlan;
  }

  private async transfromConfig(functionPlan) {
    const { remote } = functionPlan;
    // 转化线上配置：监测到线上配置为空则删除相关配置
    remote.name = this.functionName;
    if (remote.instanceLifecycleConfig !== null) {
      if (_.isEmpty(remote.instanceLifecycleConfig?.preStop?.handler)) {
        delete remote.instanceLifecycleConfig.preStop;
      }
      if (_.isEmpty(remote.instanceLifecycleConfig?.preFreeze?.handler)) {
        delete remote.instanceLifecycleConfig.preFreeze;
      }
      if (_.isEmpty(remote.instanceLifecycleConfig)) {
        delete remote.instanceLifecycleConfig;
      }
    }
    if (_.isEmpty(remote.environmentVariables)) {
      delete remote.environmentVariables;
    }
    if (_.isEmpty(remote.initializer)) {
      delete remote.initializer;
      delete remote.initializationTimeout;
    }
    if (remote.instanceType !== 'g1') {
      delete remote.gpuMemorySize;
    }
    if (!_.isEmpty(remote.customDNS)) {
      if (_.isEmpty(remote.customDNS.nameServers) && !_.has(functionPlan.local, 'customDNS.nameServers')) {
        delete remote.customDNS.nameServers;
      }
      if (_.isEmpty(remote.customDNS.dnsOptions) && !_.has(functionPlan.local, 'customDNS.dnsOptions')) {
        delete remote.customDNS.dnsOptions;
      }
      if (_.isEmpty(remote.customDNS.searches) && !_.has(functionPlan.local, 'customDNS.searches')) {
        delete remote.customDNS.searches;
      }
    }
    if (_.isEmpty(remote.customDNS)) {
      delete remote.customDNS;
    }
    if (remote.runtime === 'custom-container') {
      delete remote.customContainerConfig?.accelerationInfo;
      // 非企业镜像比对比实例 ID
      if (remote.customContainerConfig?.instanceID?.startsWith('registry.')) {
        delete remote.customContainerConfig?.instanceID;
      }
    } else {
      delete remote.customContainerConfig;
    }
    if (remote.runtime === 'custom') {
      if (_.has(remote, 'customRuntimeConfig.args') && _.isEmpty(remote?.customRuntimeConfig?.args)) {
        delete remote.customRuntimeConfig.args;
      }
    } else {
      delete remote.customRuntimeConfig;
    }
    if (_.has(remote, 'layersArnV2')) {
      remote.layers = remote.layersArnV2;
      delete remote.layersArnV2;
    }

    const remoteAsyncConfiguration = await this.getFunctionAsyncConfig();
    if (!_.isEmpty(remoteAsyncConfiguration)) {
      remote.asyncConfiguration = remoteAsyncConfiguration;
    }

    this.rmCustomContainerConfigAccelerationInfo(remote);

    // 删除本地配置不支持的字段
    const cloneRemote = this.clearInvalidField(remote, ['instanceSoftConcurrency', 'lastModifiedTime', 'createdTime', 'codeChecksum', 'codeSize', 'functionName', 'functionId']);

    // deploy 对本地做的操作
    if (!_.isEmpty(functionPlan.local.environmentVariables)) {
      functionPlan.local.environmentVariables = _.mapValues(functionPlan.local.environmentVariables, (value) => value?.toString());
    } else {
      delete functionPlan.local.environmentVariables;
    }
    if (functionPlan.local.runtime === 'custom') {
      if (!_.isEmpty(functionPlan.local.customRuntimeConfig)) {
        const { command, args } = functionPlan.local.customRuntimeConfig;
        if (_.isArray(command)) {
          functionPlan.local.customRuntimeConfig.command = command.map((value) => value?.toString());
        }
        if (_.isArray(args)) {
          functionPlan.local.customRuntimeConfig.args = args.map((value) => value?.toString());
        }
      }
      if (_.get(functionPlan, 'local.customHealthCheckConfig.httpGetUrl')) {
        functionPlan.local.customHealthCheckConfig = _.defaults(functionPlan.local.customHealthCheckConfig, FUNCTION_CUSTOM_HEALTH_CHECK_CONFIG);
      }
    }
    if (!_.isEmpty(functionPlan.local.customDNS)) {
      functionPlan.local.customDNS = this.objectDeepTransfromString(functionPlan.local.customDNS);
    }
    if (['custom'].includes(functionPlan.local.runtime) && _.isNil(functionPlan.local.caPort)) {
      functionPlan.local.caPort = DEFAULT_CA_PORT;
    }
    if (!_.isEmpty(functionPlan.local.initializer)) {
      if (_.isNil(functionPlan.local.initializationTimeout)) {
        functionPlan.local.initializationTimeout = FUNCTION_CONF_DEFAULT.timeout;
      }
    } else {
      delete functionPlan.local.initializer;
      delete functionPlan.local.initializationTimeout;
    }
    this.rmCustomContainerConfigAccelerationInfo(functionPlan.local);

    const { asyncConfiguration } = functionPlan.local;
    if (!_.isEmpty(asyncConfiguration)) {
      const destination = asyncConfiguration.destination || {};
      const { onSuccess, onFailure } = destination;
      delete asyncConfiguration.destination;

      const destinationConfig: any = {};
      if (onSuccess) {
        destinationConfig.onSuccess = {
          destination: onSuccess.replace(':::', `:${this.region}:${this.accountId}:`),
        };
      }
      if (onFailure) {
        destinationConfig.onFailure = {
          destination: onFailure.replace(':::', `:${this.region}:${this.accountId}:`),
        };
      }
      asyncConfiguration.destinationConfig = destinationConfig;
      functionPlan.local.asyncConfiguration = asyncConfiguration;
    }

    return { cloneRemote, functionPlan };
  }

  private async getFunctionAsyncConfig() {
    try {
      const { data } = await this.fcClient.getFunctionAsyncConfig(this.serviceName, this.functionName, 'LATEST');
      const config = {
        destinationConfig: {},
        maxAsyncEventAgeInSeconds: data.maxAsyncEventAgeInSeconds,
        statefulInvocation: data.statefulInvocation,
        maxAsyncRetryAttempts: data.maxAsyncRetryAttempts,
      };
      if (data.destinationConfig?.onSuccess) {
        _.set(config, 'destinationConfig.onSuccess', data.destinationConfig.onSuccess);
      }
      if (data.destinationConfig?.onFailure) {
        _.set(config, 'destinationConfig.onFailure', data.destinationConfig.onFailure);
      }

      return _.pickBy(config, (item) => !_.isNil(item));
    } catch (ex) {
      logger.debug(`getFunctionAsyncConfig error code: ${ex.code}, message ${ex.message}`);
    }
  }

  private rmCustomContainerConfigAccelerationInfo(obj) {
    if (isCustomContainer(obj?.runtime)) {
      if (_.has(obj.customContainerConfig, 'accelerationInfo')) {
        delete obj.customContainerConfig.accelerationInfo;
      }
      const customContainerConfig = {};
      _.forIn(obj.customContainerConfig, (value, key) => {
        if (!_.isNil(value)) {
          customContainerConfig[key] = value;
        }
      });
      obj.customContainerConfig = customContainerConfig;
    }
    if (_.has(obj, 'codeChecksum')) {
      delete obj.codeChecksum;
    }
    if (_.has(obj, 'codeSize')) {
      delete obj.codeSize;
    }
    return obj;
  }

  private async getFunctionConfig() {
    try {
      const { data } = await this.fcClient.getFunction(this.serviceName, this.functionName);
      return data;
    } catch (ex) {
      logger.debug(`info error:: ${ex.message}`);
      if (ex.message === 'failed with 403') {
        return ex.message;
      }
    }
  }
}