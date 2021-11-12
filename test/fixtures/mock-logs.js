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
  // Assign mocked properties directly to npmlog
  // and then mock with that object. This is necessary
  // so tests can still directly set `log.level = 'silent'`
  // and have that reflected in the npmlog singleton.
  // XXX: remove with npmlog
  npmlog: Object.assign(npmlog, {
    timing: (...args) => fn('timing', ...args),
    ...mocks.npmlog,
  }),
})
