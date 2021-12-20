import _ from 'lodash';
import * as core from '@serverless-devs/core';
import diff from 'variable-diff';
import logger from '../../common/logger';
import PlanDeployBase from "./plan-base";

export default class PlanTrigger extends PlanDeployBase {
  async getPlan() {
    if (_.isEmpty(this.service) || _.isEmpty(this.functionConfig) || _.isEmpty(this.triggers)) {
      logger.debug(`service/function/triggers config is empty, skip getTriggersPlan`);
      return {};
    }

    const plan = [];
    for (const triggerConfig of this.triggers) {
      const { name, type } = triggerConfig;
      // 获取缓存
      const state = await core.getState(`${this.accountId}-${this.region}-${this.serviceName}-${this.functionName}-${name}`);
      
      // 获取线上配置
      const remote = await this.getTriggerConfig(name);
      logger.debug(`function local config: ${JSON.stringify(triggerConfig)}`);
      logger.debug(`function state config: ${state ? JSON.stringify(state) : 'null'}`);
      logger.debug(`function remote config: ${remote ? JSON.stringify(remote) : 'null'}`);

      // TODO: 没有权限
      if (_.isString(remote)) { }
      // 远端不存在：deploy 时不交互
      if (_.isEmpty(remote)) {
        plan.push({
          remote,
          local: triggerConfig,
          diff: 'remoteNull',
          needInteract: false,
        });
        continue;
      } else if (type === 'mns_topic' || type === 'tablestore') {
        logger.debug('TriggerType is mns_topic or tablestore not update');
        continue;
      }

      const { triggerPlan, cloneRemote } = this.transfromConfig(_.cloneDeep({ local: triggerConfig, remote }));
      const { changed, text } = diff(cloneRemote, triggerPlan.local);

      // 本地缓存和线上配置相等：deploy 时不交互
      if (state?.statefulConfig?.name) {
        delete state?.statefulConfig?.name;
      }
      triggerPlan.needInteract = _.isEqual(state?.statefulConfig || {}, remote) ? false : changed;
      triggerPlan.diff = text?.substring(2, text.length - 1);
      logger.debug(`functionPlan needInteract: ${changed}`);
      logger.debug(`functionPlan diff:\n${text}`);
      triggerPlan.plan = this.diff(cloneRemote, triggerPlan.local);
      
      plan.push(triggerPlan);
    }
    return plan;
  }

  private transfromConfig(triggerPlan) {
    const { local, remote } = triggerPlan;
    const { triggerType } = remote;
    if (local.qualifier) {
      local.qualifier = local.qualifier.toString();
    }
    const cloneRemote: any = {
      name: remote.triggerName,
      type: triggerType,
    }
    if (!_.isEmpty(remote.description)) {
      cloneRemote.description = remote.description;
    }
    if (!_.isNil(remote.qualifier)) {
      cloneRemote.qualifier = remote.qualifier;
    }
    if (!_.isNil(remote.triggerConfig)) {
      cloneRemote.config = remote.triggerConfig;
    }
    if (!_.isNil(remote.invocationRole)) {
      cloneRemote.role = remote.invocationRole;
    }
    if (!_.isNil(remote.sourceArn)) {
      cloneRemote.sourceArn = remote.sourceArn;
    }

    if (triggerType === 'log' && local.config?.logConfig?.project) {
      local.sourceArn = `acs:log:${this.region}:${this.accountId}:project/${local.config.logConfig.project}`;
    } else if (triggerType === 'cdn_events') {
      local.sourceArn = `acs:cdn:*:${this.accountId}`;
    } else if (triggerType === 'oss' && local.config?.bucketName) {
      local.sourceArn = `acs:oss:${this.region}:${this.accountId}:${local.config.bucketName}`;
      delete local.config.bucketName;
    } else if (triggerType === 'http') {
      if (_.isNil(_.get(local, 'config.methods'))) {
        _.set(local, 'config.methods', ['GET']);
      }
    }

    triggerPlan.local = local;
    return {
      triggerPlan,
      cloneRemote,
    };
  }

  private async getTriggerConfig(triggerName) {
    try {
      const { data } = await this.fcClient.getTrigger(this.serviceName, this.functionName, triggerName);
      return data;
    } catch (ex) {
      logger.debug(`info error:: ${ex.message}`);
      if (ex.message === 'failed with 403') {
        return ex.message;
      }
    }
  }
}