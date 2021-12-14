const typeColors = {
  modified: '\x1B[33m',
  added: '\x1B[32m',
  gray: '\x1B[22m',
  removed: '\x1B[31m'
};

const options = {
  indent: '  ',
  newLine: '\n',
  wrap: function wrap(type, text) {
    // return text;
    return `${typeColors[type]}${text}\x1B[0m`;
  },
  color: true
};
const isObject = (obj) => Object.prototype.toString.call(obj) === '[object Object]';

export default class Diff {
  static diff(left, right) {
    return this.diffInternal(left, right)
  }

  private static diffInternal(left, right) {
    let text = '';
    let changed = false;

    if (left === right) {
      text = options.wrap('gray', this.printVar(left))
    } else if (Array.isArray(left) && Array.isArray(right)) {
      let itemDiff;
      let subOutput = '';
      for (let i = 0; i < left.length; i++) {
        if (i < right.length) {
          itemDiff = this.diffInternal(left[i], right[i]);
          if (itemDiff.changed) {
            subOutput += this.keyChanged(i, itemDiff.text);
            changed = true;
          } else {
            subOutput += this.printVar(itemDiff.text);
          }
        } else {
          subOutput += this.keyRemoved(i, left[i]);
          changed = true;
        }
      }
      if (right.length > left.length) {
        for (let i = left.length - 1; i < right.length; i++) {
          subOutput += this.keyAdded(i, right[i]);
        }
        changed = true;
      }
      text = '[' + options.newLine + subOutput + ']';
    } else if (isObject(left) && isObject(right)) {
      let itemDiff;
      let key = '';
      let subOutput = '';
      const rightObj = Object.assign({}, right);
      const keys = Object.keys(left).sort();

      for (var i = 0; i < keys.length; i++) {
        key = keys[i];
        if (right.hasOwnProperty(key)) {
          itemDiff = this.diffInternal(left[key], right[key]);
          if (itemDiff.changed) {
            subOutput += this.keyChanged(key, itemDiff.text);
            changed = true;
          } else {
            subOutput += this.noChanged(key, itemDiff.text);
          }
          delete rightObj[key];
        } else {
          subOutput += this.keyRemoved(key, left[key]);
          changed = true;
        }
      }

      const addedKeys = Object.keys(rightObj);
      for (var i = 0; i < addedKeys.length; i++) {
        subOutput += this.keyAdded(addedKeys[i], right[addedKeys[i]]);
        changed = true;
      }

      text = '{' + options.newLine + subOutput + '}';
    } else if (left !== right) {
      text = options.wrap('modified', this.printVar(left) + ' => ' + this.printVar(right));
    }

    return { text, changed };
  }

  private static keyRemoved(key, variable) {
    return options.wrap('removed', '- ' + key + ': ' + this.printVar(variable)) + options.newLine;
  }

  private static keyAdded(key, variable) {
    return options.wrap('added', '+ ' + key + ': ' + this.printVar(variable)) + options.newLine;
  }

  private static noChanged(key, text) {
    return options.wrap('gray', options.indent + key + ': ' + this.indentSubItem(text)) + options.newLine;
  }

  private static keyChanged(key, text) {
    return options.indent + key + ': ' + this.indentSubItem(text) + options.newLine;
  }

  private static indentSubItem(text) {
    return text.split(options.newLine).map(function onMap(line, index) {
      if (index === 0) {
        return line;
      }
      return options.indent + line;
    }).join(options.newLine);
  }

  private static printVar(variable) {
    if (typeof variable === 'function') {
      return variable.toString().replace(/\{.+\}/,'{}');
    } else if((typeof variable === 'object' || typeof variable === 'string') && !(variable instanceof RegExp)) {
      return JSON.stringify(variable);
    }
  
    return '' + variable;
  }
}
