import deepDiff from 'deep-diff-pizza';
import _ from 'lodash';
import logger from '../common/logger';

const typeColors = {
  UPDATED: '\x1B[33m',
  ADDED: '\x1B[32m',
  UNCHANGED: '\x1B[22m',
  REMOVED: '\x1B[31m'
};
const mark = {
  ADDED: '+',
  REMOVED: '-',
};

const options = {
  getIndent: (num) => new Array(num).fill(' ').join(''),
  newLine: '\n',
  wrap: (type, text) => {
    // return text;
    return `${typeColors[type]}${text}\x1B[0m`;
  },
  color: true
};

export default class Diff {
  static diff(left, right) {
    const diffArrRes = deepDiff(left, right);

    const diffObjRes = {};

    for (const diffItem of diffArrRes) {
      const {
        operation: __operation,
        path: diffPath,
        is: __rValue,
        was: __lValye,
      } = diffItem;
      const v = {
        __operation,
        __rValue,
        __lValye,
      }
      _.set(diffObjRes, diffPath, v);
    }
    return this.showObj(diffObjRes, 1);
  }

  static showArr(diffArrRes, depth) {
    const indent = options.getIndent(depth * 2); // 前面多少个空格
    const showArr = [];
    for (const index in diffArrRes) {
      const value = diffArrRes[index];
      if (_.isArray(value)) {
        const keyMark = this.getObjMarkKeys(value);
        const keyStr = keyMark === 'UNCHANGED' ? `${indent}[` : options.wrap(keyMark, `${indent}${mark[keyMark]} [`);

        showArr.push(keyStr);
        const str = this.showArr(value, depth + 1);
        showArr.push(str);
        showArr.push(`${indent}]`);
        continue;
      } else if (this.valueIsItem(value)) {
        const str = this.showItem(depth, index, value.__operation, value.__lValye, value.__rValue);
        showArr.push(str);
      } else {
        showArr.push(this.showObj(value, depth + 1));
      }
    }

    return showArr.join(options.newLine);
  }

  static showObj(diffObjRes, depth) {
    const indent = options.getIndent(depth * 2); // 前面多少个空格

    const showArr = [];
    for (const [key, value] of Object.entries(diffObjRes)) {
      if (_.isArray(value)) {
        const keyMark = this.getObjMarkKeys(value);
        const keyStrStart = keyMark === 'UNCHANGED' ? `${indent}${key}: [` : options.wrap(keyMark, `${indent}${mark[keyMark]} ${key}:[`);
        const keyStrEnd = keyMark === 'UNCHANGED' ? `${indent}]` : options.wrap(keyMark, `${indent}${mark[keyMark]} ]`);

        showArr.push(keyStrStart);
        showArr.push(this.showArr(value, depth + 1));
        showArr.push(keyStrEnd);
        continue;
      }

      const { __operation, __lValye, __rValue }: any = value;
      let showStr = '';
      // 不是我们处理的格式，认为是用户自定义的 obj
      if (!this.valueIsItem(value)) {
        const keyMark = this.getObjMarkKeys(value);
        const keyStr = keyMark === 'UNCHANGED' ? `${indent}${key}:` : options.wrap(keyMark, `${indent}${mark[keyMark]} ${key}:`);
        showArr.push(keyStr);
        showStr = this.showObj(value, depth + 1);
      } else {
        showStr += this.showItem(depth, key, __operation, __lValye, __rValue);
      }
      showArr.push(showStr);
    }

    return showArr.join(options.newLine);
  }

  private static showItem(depth, key, operation, lValye, rValue) {
    const indent = options.getIndent(depth * 2); // 前面多少个空格
    let showStr = '';
    // UPDATED / ADDED / UNCHANGED / REMOVED
    if (operation === 'UPDATED') {
      showStr += `${indent}${key}: ${options.wrap(operation, `${lValye} => ${rValue}`)}`;
    } else if (operation === 'UNCHANGED') {
      showStr += `${indent}${key}: ${options.wrap(operation, rValue)}`;
    } else {
      const preIndent = depth === 1 ? options.getIndent(2) : options.getIndent((depth - 1) * 2);
      const postIndent = depth === 1 ? '' : options.getIndent(2);
      showStr += options.wrap(operation, `${preIndent}${mark[operation]}${postIndent} ${key}: ${lValye || rValue}`);
    }
    return showStr;
  }

  private static getObjMarkKeys(obj) {
    const operationArr = []; // 保存子元素是否需要变化
    // for (const value of Object.values(obj)) {
    for (const [key, value] of Object.entries(obj)) {
      let markKey = 'UNCHANGED';
      if (this.valueIsItem(value)) { // 如果是自定的格式则直接判断
        const { __operation }: any = value;
        markKey = __operation;
      } else if (_.isArray(value)) { // 如果是元数据是数组
        markKey = this.getArrMarkKeys(value);
      } else {
        if (!_.isObject(value)) {
          logger.debug(`getObjMarkKeys error:\n obj: ${JSON.stringify(obj)}\nkey: ${key}\nvalue: ${value}}`);
          return 'UNCHANGED';
        }
        markKey = this.getObjMarkKeys(value);
      }

      if (!operationArr.includes(markKey)) {
        operationArr.push(markKey);
        if (operationArr.length > 1) {
          return 'UNCHANGED';
        }
      }
    }

    if (operationArr.length > 1) {
      return 'UNCHANGED';
    }
    return operationArr[0];
  }

  private static getArrMarkKeys(arr) {
    const operationArr = [];
    for (const item of arr) {
      let markKey = 'UNCHANGED';
      if (_.isArray(item)) {
        markKey = this.getArrMarkKeys(item)
      } else if (this.valueIsItem(item)) {
        markKey = item.__operation;
      } else {
        markKey = this.getObjMarkKeys(item);
      }

      if (!operationArr.includes(markKey)) {
        operationArr.push(markKey);
        if (operationArr.length > 1) {
          return 'UNCHANGED';
        }
      }
    }
    
    if (operationArr.length > 1) {
      return 'UNCHANGED';
    }
    return operationArr[0];
  }

  private static valueIsItem(value) {
    const { __operation }: any = value;
    if (_.isEmpty(__operation) && !_.has(value, '__lValye') && !_.has(value, '__rValue')) {
      return false;
    }
    return true;
  }
}
