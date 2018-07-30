'use strict';

const DISABLED = 0
const ERROR = 2

module.exports = {
  extends: 'airbnb-base',
  env: {
    node: true,
    jest: true
  },
  rules: {
    'max-len': [ERROR, { code: 120, tabWidth: 2 }],
    'no-console': [DISABLED],
    'no-param-reassign': [DISABLED],
    'no-underscore-dangle': [ERROR, { allow: ['_id', '_rev', '_'] }],
  }
};