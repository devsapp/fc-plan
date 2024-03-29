import { lodash as _, CatchableError } from '@serverless-devs/core';
import logger from '../../common/logger';
import { getTableHeader, getDomainAutoName, isAutoConfig, ENABLE_EB_TRIGGER_HEADER } from '../utils';


const COMMAND: string[] = [
  'service',
  'function',
  'trigger',
  'domain',
  'version',
  'alias',
  'provision',
  'ondemand',
  'onDemand',
  'layer',
];

export default class PlanRemove {
  fcClient: any;

  async plan(props, fcClient, subCommand, parsedData) {
    if (subCommand && !COMMAND.includes(subCommand)) {
      return { errorMessage: `Does not support ${subCommand} command` };
    }

    this.fcClient = fcClient;
    logger.debug(`parsedData:: ${JSON.stringify(parsedData)}`);

    const region = parsedData['region'] || props.region;
    const serviceName = parsedData['service-name'] || props.service?.name;
    const functionName = parsedData['function-name'] || props.function?.name;
    let triggerNames;
    if (_.isString(parsedData['trigger-name'])) {
      triggerNames = [parsedData['trigger-name']];
    } else if (_.isArray(parsedData['trigger-name'])) {
      triggerNames = parsedData['trigger-name'];
    } else {
      triggerNames = props.triggers?.map(({ name }) => name);
    }
    let customDomains;
    if (_.isString(parsedData['domain-name'])) {
      customDomains = [parsedData['domain-name']];
    } else if (_.isArray(parsedData['domain-name'])) {
      customDomains = parsedData['domain-name'];
    } else {
      customDomains = props.customDomains?.map(
        ({ domainName }) => isAutoConfig(domainName) ? getDomainAutoName(functionName, serviceName, fcClient.accountid, region) : domainName
      );
    }

    const qualifier = parsedData.qualifier;
    const layerName = parsedData['layer-name'];
    const versionId = parsedData['version-id']; // || parsedData.id;
    const aliasName = parsedData['alias-name'];

    let showTitle = `Need to delete the resource in the \x1B[1m${region}\x1B[0m area`;
    if (_.isEmpty(subCommand) || ['domain', 'layer'].includes(subCommand)) {
      showTitle += ':\n';
    } else {
      showTitle += `, the operation service is \x1B[1m${serviceName}\x1B[0m:\n`;
    }
    logger.log(showTitle);
    const plan = [];
    try {
      if (_.isEmpty(subCommand)) {
        await this.caseService(serviceName, plan);

        const domains = await this.domainPlan(customDomains);
        if (!_.isEmpty(domains?.data)) {
          plan.push(domains);
        }
        return plan;
      }

      // version 需要检测 alias / ondemand / provision
      // alias 需要检测 ondemand / provision
      // function 需要检测 latest 的 ondemand / provision
      switch (subCommand) {
        case 'domain':
          const domains = await this.domainPlan(customDomains);
          if (!_.isEmpty(domains?.data)) {
            plan.push(domains);
          }
          break;
        case 'layer':
          const layerPlan = await this.layerPlan(layerName, versionId);
          if (!_.isEmpty(layerPlan?.data)) {
            plan.push(layerPlan);
          }
          break;
        case 'ondemand':
        case 'onDemand':
          const onDemand = await this.onDemandPlan(serviceName, functionName, qualifier);
          if (!_.isEmpty(onDemand?.data)) {
            plan.push(onDemand);
          }
          break;
        case 'provision':
          const provision = await this.provisionPlan(serviceName, functionName, qualifier);
          if (!_.isEmpty(provision?.data)) {
            plan.push(provision);
          }
          break;
        case 'alias':
          const alias = await this.aliasPlan(serviceName, aliasName);
          if (!_.isEmpty(alias?.data)) {
            plan.push(alias);
          }
          break;
        case 'version':
          const version = await this.versionPlan(serviceName, versionId);
          if (!_.isEmpty(version?.data)) {
            plan.push(version);
          }
          break;
        case 'trigger':
          if (_.isEmpty(triggerNames)) {
            throw new CatchableError('The trigger name was not found, you can specify it by --trigger-name')
          }
          const trigger = await this.triggerPlan(serviceName, functionName, triggerNames);
          if (!_.isEmpty(trigger?.data)) {
            plan.push(trigger);
          }
          break;
        case 'function':
          if (_.isNil(functionName)) {
            throw new CatchableError('The functionName was not found, you can specify it by --function-name')
          }
          const func = await this.functionPlan(serviceName, functionName);
          if (!_.isEmpty(func?.data)) {
            plan.push(func);

            const trig = await this.triggerPlan(serviceName, functionName);
            if (!_.isEmpty(trig?.data)) {
              plan.push(trig);
            }
          }
          break;
        case 'service':
          await this.caseService(serviceName, plan);
          break;
        default:
          logger.error(`Not fount subCommand ${subCommand}.`);
      }
    } catch (ex) {
      if (ex?.name === 'CatchableError') {
        throw ex;
      }
      logger.error(`remove plan error:\n${ex.code || ex.name}: ${ex.message}`);
    }

    return plan;
  }

  private async caseService(serviceName, plan = []) {
    const servicePlan = await this.servicePlan(serviceName);
    plan.push(servicePlan);

    const onDemandPlan = await this.onDemandPlan(serviceName);
    if (!_.isEmpty(onDemandPlan?.data)) {
      plan.push(onDemandPlan);
    }

    const provisionPlan = await this.provisionPlan(serviceName);
    if (!_.isEmpty(provisionPlan?.data)) {
      plan.push(provisionPlan);
    }

    const aliasPlan = await this.aliasPlan(serviceName);
    if (!_.isEmpty(aliasPlan?.data)) {
      plan.push(aliasPlan);
    }

    const versionPlan = await this.versionPlan(serviceName);
    if (!_.isEmpty(versionPlan?.data)) {
      plan.push(versionPlan);
    }

    const functionPlan = await this.functionPlan(serviceName);
    if (!_.isEmpty(functionPlan?.data)) {
      plan.push(functionPlan);

      let triggers = [];
      for (const functionConfig of functionPlan.data) {
        const triggerPlan = await this.triggerPlan(serviceName, functionConfig.functionName);
        if (!_.isEmpty(triggerPlan?.data)) {
          triggers = _.concat(triggers, triggerPlan?.data);
        }
      }
      plan.push({
        resources: 'triggers',
        data: triggers,
        header: getTableHeader(['functionName', 'triggerName', 'triggerType', 'qualifier']),
      });
    }

    return plan;
  }

  private async domainPlan(customDomains) {
    if (_.isEmpty(customDomains)) {
      return {};
    }

    let domains = await this.fcClient.get_all_list_data('/custom-domains', 'customDomains');;
    domains = domains.filter(item => customDomains.includes(item.domainName));

    return {
      resources: 'customDomains',
      data: domains,
      header: getTableHeader(['domainName', 'protocol', 'lastModifiedTime']),
    }
  }

  private async servicePlan(serviceName: string) {
    const { data } = await this.fcClient.getService(serviceName);

    return {
      resources: 'service',
      data: [data],
      header: getTableHeader(['serviceName', 'description']),
    }
  }

  private async functionPlan(serviceName: string, functionName?: string) {
    let functions = await this.fcClient.get_all_list_data(`/services/${serviceName}/functions`, 'functions');
    if (!_.isNil(functionName)) {
      functions = functions?.filter(item => item.functionName === functionName)
    }

    return {
      resources: 'function',
      data: functions,
      header: getTableHeader(['functionName', 'runtime', 'description']),
    }
  }

  private async triggerPlan(serviceName: string, functionName: string, triggerNames?: string[]) {
    if (_.isNil(serviceName)) {
      throw new CatchableError('The serviceName was not found, you can specify it by --service-name')
    }
    if (_.isNil(functionName)) {
      throw new CatchableError('The functionName was not found, you can specify it by --function-name')
    }

    const listTriggersPath = `/services/${serviceName}/functions/${functionName}/triggers`;
    let triggers = await this.fcClient.get_all_list_data(listTriggersPath, 'triggers', {}, ENABLE_EB_TRIGGER_HEADER);
    if (!_.isEmpty(triggerNames)) {
      triggers = triggers?.filter(({ triggerName }) => triggerNames.includes(triggerName));
    }
    // EB 触发器在 EB 创建的无法处理或者删除
    triggers = triggers?.filter(({ triggerName }) => !triggerName.includes('|'));
    return {
      resources: 'trigger',
      data: triggers.map(item => ({ ...item, functionName })),
      header: getTableHeader(['functionName', 'triggerName', 'triggerType', 'qualifier']),
    };
  }

  private async versionPlan(serviceName: string, versionId?: string) {
    if (_.isNil(serviceName)) {
      throw new CatchableError('The serviceName was not found, you can specify it by --service-name')
    }

    let versions = await this.fcClient.get_all_list_data(`/services/${serviceName}/versions`, 'versions');;
    if (versionId) {
      versions = versions.filter(item => item.versionId === versionId.toString());
    }
    return {
      resources: 'version',
      data: versions,
      header: getTableHeader(['versionId', 'description', 'createdTime', 'lastModifiedTime']),
    }
  }

  private async aliasPlan(serviceName: string, aliasName?: string) {
    if (_.isNil(serviceName)) {
      throw new CatchableError('The serviceName was not found, you can specify it by --service-name')
    }

    let alias;
    if (aliasName) {
      const { data } = await this.fcClient.getAlias(serviceName, aliasName);
      if (!_.isEmpty(data)) {
        alias = [data];
      }
    } else {
      alias = await this.fcClient.get_all_list_data(`/services/${serviceName}/aliases`, 'aliases');
    }

    const showWeight = {
      value: 'additionalVersionWeight',
      formatter: (value) => {
        const gversion = Object.keys(value)[0];
        if (gversion) {
          return `additionalVersion: ${gversion}\nWeight: ${value[gversion] * 100}%`;
        }
        return '';
      },
    };

    return {
      resources: 'alias',
      data: alias,
      header: getTableHeader(['aliasName', 'versionId', 'description', 'createdTime', 'lastModifiedTime', showWeight]),
    }
  }

  private async provisionPlan(serviceName: string, functionName?: string, qualifier?: string) {
    if (_.isNil(serviceName)) {
      throw new CatchableError('The serviceName was not found, you can specify it by --service-name')
    }
    if (_.isNil(qualifier) && functionName) {
      throw new CatchableError('When the functionName exists, the qualifier must exist, which can be specified by --qualifier');
    }

    let provisionConfigs;
    if (qualifier && functionName) {
      const { data } = await this.fcClient.getProvisionConfig(serviceName, functionName, qualifier);
      if (!_.isEmpty(data)) {
        provisionConfigs = [data];
      }
    } else {
      provisionConfigs = (await this.fcClient.get_all_list_data('/provision-configs', 'provisionConfigs', {
        serviceName,
        qualifier,
      }));
    }

    const showKey = [
      { value: 'serviceName', width: '10%' },
      { value: 'qualifier', width: '10%' },
      { value: 'functionName', width: '10%' },
      { value: 'target', width: '10%', alias: 'target', formatter: (value) => value || '0' },
      { value: 'current', width: '10%', alias: 'current', formatter: (value) => value || '0' },
      {
        value: 'scheduledActions',
        width: '25%',
        formatter: (value) => (value && value.length ? JSON.stringify(value, null, 2) : value),
      },
      {
        value: 'targetTrackingPolicies',
        width: '25%',
        formatter: (value) => (value && value.length ? JSON.stringify(value, null, 2) : value),
      },
    ];
    return {
      resources: 'provision',
      data: provisionConfigs?.filter((item) => item.target || item.current)
        .map((item) => ({
          serviceName: item.resource.split('#')[1],
          qualifier: item.resource.split('#')[2],
          functionName: item.resource.split('#')[3],
          ...item,
        })),
      header: getTableHeader(showKey),
    }
  }

  private async onDemandPlan(serviceName: string, functionName?: string, qualifier?: string) {
    if (_.isEmpty(serviceName)) {
      throw new CatchableError('The serviceName was not found, you can specify it by --service-name')
    }

    if (_.isNil(qualifier) && functionName) {
      throw new CatchableError('When the qualifier exists, the functionName must exist, which can be specified by --qualifier');
    }

    let ondemands;
    if (qualifier && functionName) {
      const { data } = await this.fcClient.getOnDemandConfig(serviceName, functionName, qualifier)
      if (!_.isEmpty(data)) {
        ondemands = [data];
      }
    } else {
      ondemands = (await this.fcClient.get_all_list_data('/on-demand-configs', 'configs', {
        prefix: serviceName ? `services/${serviceName}` : '',
      }));
      ondemands = qualifier ? ondemands?.filter((item) => item.resource.startsWith(`services/${serviceName}.${qualifier}/`)) : ondemands;
    }

    return {
      title: `Resources under service(${serviceName}):`,
      resources: 'ondemand',
      data: ondemands?.map((item) => {
        const [, service, , functionName] = item.resource.split('/');
        const serviceArr = service.split('.');
        return {
          serviceName: serviceArr[0],
          qualifier: serviceArr[1],
          functionName,
          ...item,
        };
      }),
      header: getTableHeader(['serviceName', 'qualifier', 'functionName', 'maximumInstanceCount']),
    }
  }

  private async layerPlan(layerName, versionId) {
    if (_.isNil(layerName)) {
      throw new CatchableError('The parameter layerName was not found, please use --layer-name to specify');
    }

    let lasyers;
    if (versionId) {
      lasyers = [(await this.fcClient.getLayerVersion(layerName, versionId))?.data];
    } else {
      lasyers = await this.fcClient.get_all_list_data(`/layers/${layerName}/versions`, 'layers');
    }

    return {
      resources: 'lasyer',
      data: lasyers,
      header: getTableHeader(['layerName', 'description', 'version', 'compatibleRuntime', 'arn']),
    };
  }
}
