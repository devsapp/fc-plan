import _ from 'lodash';
import * as core from '@serverless-devs/core';
import diff from 'variable-diff';
import logger from '../../common/logger';
import PlanDeployBase from "./plan-base";

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
    
    const { functionPlan, cloneRemote } = this.transfromConfig(_.cloneDeep({
      remote,
      local: this.functionConfig,
    }));

    // 不对比代码配置
    delete functionPlan.local.codeUri;
    delete functionPlan.local.ossBucket;
    delete functionPlan.local.ossKey;

    // 转化后的线上配置和本地做 diff
    const { changed, text } = diff(cloneRemote, functionPlan.local);

    // 本地缓存和线上配置相等：deploy 时不交互
    functionPlan.needInteract = _.isEqual(state, functionPlan.remote) ? false : changed;
    functionPlan.diff = text?.substring(2, text.length - 1);
    logger.debug(`functionPlan needInteract: ${changed}`);
    logger.debug(`functionPlan diff:\n${text}`);
    
    // 回写代码配置
    functionPlan.local.codeUri = this.functionConfig.codeUri;
    functionPlan.local.ossBucket = this.functionConfig.ossBucket;
    functionPlan.local.ossKey = this.functionConfig.ossKey;
    return functionPlan;
  }

  private transfromConfig(functionPlan) {
    const { remote } = functionPlan;
    // 转化线上配置：监测到线上配置为空则删除相关配置
    remote.name = this.functionName;
    if (_.isEmpty(remote.instanceLifecycleConfig?.preStop?.handler)) {
      delete remote.instanceLifecycleConfig.preStop;
    }
    if (_.isEmpty(remote.instanceLifecycleConfig?.preFreeze?.handler)) {
      delete remote.instanceLifecycleConfig.preFreeze;
    }
    if (_.isEmpty(remote.instanceLifecycleConfig)) {
      delete remote.instanceLifecycleConfig;
    }
    if (_.isEmpty(remote.initializer)) {
      delete remote.initializer;
      delete remote.initializationTimeout;
    }
    if (remote.instanceType !== 'g1') {
      delete remote.gpuMemorySize;
    }
    if (_.isNil(remote.customDNS)) {
      delete remote.customDNS;
    }

    // 删除本地配置不支持的字段
    const cloneRemote = this.clearInvalidField(remote, ['lastModifiedTime', 'createdTime', 'codeChecksum', 'codeSize', 'functionName', 'functionId']);

    // deploy 对本地做的操作
    if (!_.isEmpty(functionPlan.local.environmentVariables)) {
      functionPlan.local.environmentVariables = _.mapValues(functionPlan.local.environmentVariables, (value) => value?.toString());
    }
    if (!_.isEmpty(functionPlan.local.customDNS)) {
      functionPlan.local.customDNS = this.objectDeepTransfromString(functionPlan.local.customDNS);
    }

    return { cloneRemote, functionPlan };
  }

  private async getFunctionConfig () {
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