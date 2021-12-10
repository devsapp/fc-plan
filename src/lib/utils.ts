import _ from "lodash";

export const getDomainAutoName = (functionName, serviceName, accountId, region) =>
  `${functionName}.${serviceName}.${accountId}.${region}.fc.devsapp.net`.toLocaleLowerCase();

export function isAutoConfig(config: any): boolean {
  return config === 'auto' || config === 'Auto';
}

export const getTableHeader = (showKey) => {
  const header_option = {
    headerColor: 'cyan',
    color: 'cyan',
    align: 'left',
    width: 'auto',
    formatter: (v) => v,
  }

  return showKey.map((value) => (_.isString(value) ? ({
    ...header_option,
    value,
  }) : ({ ...header_option, ...value })))
};