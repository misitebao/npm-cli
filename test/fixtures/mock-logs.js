const npmlog = require('npmlog')
const { LEVELS } = require('proc-log')

module.exports = (fn, mocks = {}) => ({
  'proc-log': {
    LEVELS,
    ...LEVELS.reduce((acc, l) => {
      acc[l] = (...args) => fn(l, ...args)
      return acc
    }, {}),
    ...mocks['proc-log'],
  },
  npmlog: {
    ...npmlog,
    timing: (...args) => fn('timing', ...args),
    ...mocks.npmlog,
  },
})
