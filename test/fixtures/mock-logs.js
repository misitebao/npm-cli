
const NPMLOG = require('npmlog')
const { LEVELS } = require('proc-log')

const mockLogs = (mocks = {}) => {
  // A plain array with getters for each log level
  const logs = Object.defineProperties(
    [],
    ['timing', ...LEVELS].reduce((acc, level) => {
      acc[level] = {
        get () {
          return this
            .filter(([l]) => level === l)
            .map(([, ...args]) => args)
        },
      }
      return acc
    }, {})
  )

  return {
    logs,
    mocks: {
      'proc-log': {
        LEVELS,
        ...LEVELS.reduce((acc, l) => {
          acc[l] = (...args) => {
            // Re-emit log item for debug file testing
            process.emit('log', l, ...args)
            // Dont add pause/resume events to the logs. Those aren't displayed
            // and emitting them is tested in the display layer
            if (l !== 'pause' && l !== 'resume') {
              logs.push([l, ...args])
            }
          }
          return acc
        }, {}),
        ...mocks['proc-log'],
      },
      // Assign mocked properties directly to npmlog
      // and then mock with that object. This is necessary
      // so tests can still directly set `log.level = 'silent'`
      // and have that reflected in the npmlog singleton.
      // XXX: remove with npmlog
      npmlog: Object.assign(NPMLOG, {
      // no-op all npmlog methods by default so tests
      // dont output anything to the terminal
        ...Object.keys(NPMLOG.levels).reduce((acc, k) => {
          acc[k] = () => {}
          return acc
        }, {}),
        // except collect timing logs
        timing: (...args) => logs.push(['timing', ...args]),
        ...mocks.npmlog,
      }),
    },
  }
}

module.exports = mockLogs
