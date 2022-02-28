import * as core from '@serverless-devs/core';
import diff from 'variable-diff';
import logger from '../../common/logger';
import { getDomainAutoName } from '../utils';
import PlanDeployBase from "./plan-base";

const _ = core.lodash;
export default class PlanTrigger extends PlanDeployBase {
  async getPlan(credentials) {
    if (_.isEmpty(this.customDomains)) {
      logger.debug(`customDomains config is empty, skip getTriggersPlan`);
      return {};
    }
    const plan = [];
    for (const customDomain of this.customDomains) {
      // 获取本地配置
      let { domainName } = customDomain;
      if (_.isEmpty(domainName)) {
        logger.debug(`${this.accountId}-${this.region}-${this.serviceName}-${this.functionName}-customDomain name not fount`);
        continue;
      }
      const nameIsAuto = this.isAutoConfig(domainName);
      // 获取缓存
      const stateId = nameIsAuto ? getDomainAutoName(this.functionName, this.serviceName, this.accountId, this.region) : domainName;
      const state = await core.getState(stateId);

      if (nameIsAuto) {
        if (_.isEmpty(state)) {
          domainName = getDomainAutoName(this.functionName, this.serviceName, this.accountId, this.region);
        } else {
          domainName = state.domainName;
        }
      }

      const remote = await this.getDomainConfig(domainName);
      logger.debug(`domain ${domainName} local config: ${JSON.stringify(customDomain)}`);
      logger.debug(`domain ${domainName} state config: ${state ? JSON.stringify(state) : 'null'}`);
      logger.debug(`domain ${domainName} remote config: ${remote ? JSON.stringify(remote) : 'null'}`);
      
      // TODO: 没有权限
      if (_.isString(remote)) { }
      // 远端不存在：deploy 时不交互
      if (_.isEmpty(remote)) {
        plan.push({
          remote,
          local: customDomain,
          diff: 'remoteNull',
          needInteract: false,
        })
        continue;
      }

      const { domainPlan, cloneRemote } = await this.transfromConfig(_.cloneDeep({ local: customDomain, remote }), credentials);
      // 如果域名是 auto，临时修改为预期的域名
      if (nameIsAuto) {
        domainPlan.local.domainName = domainName;
      }

      // 转化后的线上配置和本地做 diff
      const { changed, text } = diff(cloneRemote, domainPlan.local);

      // 本地缓存和线上配置相等：deploy 时不交互
      domainPlan.needInteract = _.isEqual(state, remote) ? false : changed;
      domainPlan.diff = text?.substring(2, text.length - 1);
      logger.debug(`domainPlan needInteract: ${changed}`);
      logger.debug(`domainPlan diff:\n${text}`);

      domainPlan.plan = this.diff(cloneRemote, domainPlan.local);

      // 还原 yaml 配置
      domainPlan.local.domainName = customDomain.domainName;
      domainPlan.local.routeConfigs = domainPlan.local.routeConfig;
      delete domainPlan.local.routeConfig;
      plan.push(domainPlan);
    }
    return plan;
  }

  // TODO: methods 需要处理
  private async transfromConfig(domainPlan, credentials) {
    const cloneRemote = this.clearInvalidField(domainPlan.remote, ['accountId', 'apiVersion', 'createdTime', 'lastModifiedTime']);
    if (!cloneRemote.certConfig?.certName) {
      delete cloneRemote.certConfig;
    }
    if (!_.isEmpty(cloneRemote.routeConfig?.routes)) {
      cloneRemote.routeConfig = cloneRemote.routeConfig.routes.map(item => _.omitBy(item, (char, key) => _.isNull(char) || key === 'methods'));
    }
  
    // 读取配置文件
    if (!_.isEmpty(domainPlan.local.certConfig)) {
      const { privateKey, certificate } = domainPlan.local.certConfig;

      const { HttpsCertConfig } = await core.loadComponent('devsapp/fc-core');
      if (privateKey) {
        domainPlan.local.certConfig.privateKey = await HttpsCertConfig.getCertKeyContent(privateKey, {
          credentials,
        });
      }
      if (certificate) {
        domainPlan.local.certConfig.certificate = await HttpsCertConfig.getCertKeyContent(certificate, {
          credentials,
        });
      }
    } else if (domainPlan.local.certId) {
      const { HttpsCertConfig } = await core.loadComponent('devsapp/fc-core');
      domainPlan.local.certConfig = await HttpsCertConfig.getUserCertificateDetail(domainPlan.local.certId, {
        credentials,
      });
      delete domainPlan.local.certId;
    }
    // 补全可省略的配置
    if (!_.isEmpty(domainPlan.local.routeConfigs)) {
      domainPlan.local.routeConfig = domainPlan.local.routeConfigs.map(item => {
        if (_.has(item, 'methods')) {
          delete item.methods;
        }
        return ({
          serviceName: this.serviceName,
          functionName: this.functionName,
          ...item,
        })
      });
      delete domainPlan.local.routeConfigs;
    }

    return { domainPlan, cloneRemote };
  }

  private async getDomainConfig(domainName) {
    try {
      const { data } = await this.fcClient.getCustomDomain(domainName);
      return data;
    } catch (ex) {
      logger.debug(`info error:: ${ex.message}`);
      if (ex.message === 'failed with 403') {
        return ex.message;
      }
    }
  }
}