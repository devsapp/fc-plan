import { lodash as _ } from '@serverless-devs/core';

export const getDomainAutoName = (functionName, serviceName, accountId, region) =>
  `${functionName}.${serviceName}.${accountId}.${region}.fc.devsapp.net`.toLocaleLowerCase();

export function isAutoConfig(config: any): boolean {
  return config === 'auto' || config === 'Auto';
}

export function isAutoNasConfig(config: any): boolean {
  if (isAutoConfig(config)) {
    return true;
  }

  return _.toLower(config) === 'autoperformance';
}

export const getTableHeader = (showKey) => {
  const header_option = {
    headerColor: 'white',
    color: 'white',
    align: 'left',
    width: 'auto',
    formatter: (v) => v,
  }

  return showKey.map((value) => (_.isString(value) ? ({
    ...header_option,
    value,
  }) : ({ ...header_option, ...value })))
};

export const ENABLE_EB_TRIGGER_HEADER = {
  'x-fc-enable-eventbridge-trigger': 'enable',
}
