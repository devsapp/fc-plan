import _ from "lodash";


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