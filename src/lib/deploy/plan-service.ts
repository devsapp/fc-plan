import _ from 'lodash';
import * as core from '@serverless-devs/core';
import diff from 'variable-diff';
import logger from '../../common/logger';
import PlanDeployBase from "./plan-base";

export default class PlanService extends PlanDeployBase {
  async getPlan() {
    if (_.isEmpty(this.service)) {
      logger.debug(`service config is empty, skip getServicePlan`);
      return {};
    }
    // 获取缓存
    const state = await core.getState(`${this.accountId}-${this.region}-${this.serviceName}`);
    // 获取线上配置
    const remote = await this.getServiceConfig();

    logger.debug(`service local config: ${JSON.stringify(this.service)}`);
    logger.debug(`service state config: ${state ? JSON.stringify(state) : 'null'}`);
    logger.debug(`service remote config: ${remote ? JSON.stringify(remote) : 'null'}`);

    // TODO: 没有权限
    if (_.isString(remote)) { }
    // 远端不存在：deploy 时不交互
    if (_.isEmpty(remote)) {
      return {
        remote,
        local: this.service,
        diff: 'remoteNull',
        needInteract: false,
      };
    }
    
    if (state?.statefulConfig?.name) {
      delete state?.statefulConfig?.name;
    }
    const { servicePlan, cloneRemote } = this.transfromConfig(_.cloneDeep({
      remote,
      local: this.service,
    }));
    // 转化后的线上配置和本地做 diff
    const { changed, text } = diff(cloneRemote, servicePlan.local);
    // 本地缓存和线上配置相等：deploy 时不交互
    servicePlan.needInteract = _.isEqual(state?.statefulConfig || {}, remote) ? false : changed;
    logger.debug('diff service remote and state?.statefulConfig::');
    logger.debug(diff(state?.statefulConfig || {}, remote)?.text);
    logger.debug(`servicePlan needInteract: ${changed}`);
    servicePlan.diff = text?.substring(2, text.length - 1);
    servicePlan.plan = this.diff(cloneRemote, servicePlan.local);
    logger.debug(`servicePlan diff:\n${text}`);
    return servicePlan;
  }

  // 转化线上配置：监测到线上配置为空则删除相关配置
  // 转化本地配置：监测到线上存在配置，本地是 auto，则复用线上配置
  private transfromConfig(servicePlan) {
    const { remote } = servicePlan;
    remote.name = this.serviceName;
    // 日志配置 
    const logLocalConfigAuto = this.isAutoConfig(this.service.logConfig);
    if (_.isEmpty(remote.logConfig?.project)) {
      delete remote.logConfig;
    } else if (logLocalConfigAuto) {
      servicePlan.local.logConfig = remote.logConfig;
    }

    // 专有网络配置
    const vpcLocalConfigAuto = this.isAutoConfig(this.service.vpcConfig) || (_.isEmpty(this.service.vpcConfig) && this.isAutoConfig(this.service.nasConfig));
    if (_.isEmpty(remote.vpcConfig?.vpcId)) {
      delete remote.vpcConfig;
    } else {
      delete remote.vpcConfig.role;
      // 如果本地存在专有网络配置，则兼容交换机配置
      if (!_.isEmpty(this.service.vpcConfig?.vswitchIds)) {
        remote.vpcConfig.vswitchIds = remote.vpcConfig.vSwitchIds;
        delete remote.vpcConfig.vSwitchIds;
      // 本地 vpcConfig 是 auto，或者本地配置不存在并且 nasConfig 是 auto 的：复用配置
      } else if (vpcLocalConfigAuto) {
        servicePlan.local.vpcConfig = remote.vpcConfig;
      }
    }

    // 存储配置
    const nasLocalConfigAuto = this.isAutoConfig(this.service.nasConfig);
    if (_.isEmpty(remote.nasConfig?.mountPoints)) {
      delete remote.nasConfig;
    } else {
      const { userId, groupId, mountPoints } = remote.nasConfig;

      remote.nasConfig = {
        userId,
        groupId,
        mountPoints: mountPoints?.map((item) => {
          const [serverAddr, nasDir] = item.serverAddr.split(':');
          return { serverAddr, nasDir, fcDir: item.mountDir };
        }),
      };
      if (nasLocalConfigAuto) {
        servicePlan.local.nasConfig = remote.nasConfig;
      }
    }
    // 链路追踪
    if (!_.isEmpty(remote.tracingConfig?.type)) {
      remote.tracingConfig = 'Enable';
    } else {
      delete remote.tracingConfig;
    }

    // 存在需要角色的 auto 配置
    const roleLocalAuto = this.isAutoConfig(this.service.role);
    const hasFunctionAsyncConfig = _.has(this.functionConfig || {}, 'asyncConfiguration')
    if (hasFunctionAsyncConfig || logLocalConfigAuto || vpcLocalConfigAuto || nasLocalConfigAuto || roleLocalAuto) {
      // 如果角色为 auto 或者没有配置角色，则复用配置
      if ((roleLocalAuto || _.isEmpty(this.service.role)) && !_.isEmpty(remote.role)) {
        servicePlan.local.role = remote.role;
      }
    }

    if (_.isUndefined(this.service.internetAccess)) {
      delete remote.internetAccess;
    }

    // 删除本地配置不支持的字段
    const cloneRemote = this.clearInvalidField(remote, ['vendorConfig', 'serviceName', 'serviceId', 'createdTime', 'lastModifiedTime']);
    return { cloneRemote, servicePlan }
  }

  private async getServiceConfig() {
    try {
      const { data } = await this.fcClient.getService(this.serviceName);
      return data;
    } catch (ex) {
      logger.debug(`info error:: ${ex.message}`);
      if (ex.message === 'failed with 403') {
        return ex.message;
      }
    }
  }
}