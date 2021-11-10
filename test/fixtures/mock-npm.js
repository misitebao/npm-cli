const { title, execPath } = process

const { LEVELS } = require('proc-log')

// Eventually this should default to having a prefix of an empty testdir, and
// awaiting npm.load() unless told not to (for npm tests for example).  Ideally
// the prefix of an empty dir is inferred rather than explicitly set
const RealMockNpm = (t, otherMocks = {}) => {
  const mock = {}
  mock.logs = []
  mock.outputs = []
  mock.joinedOutput = () => {
    return mock.outputs.map(o => o.join(' ')).join('\n')
  }
  mock.filteredLogs = title => mock.logs.filter(([t]) => t === title).map(([, , msg]) => msg)

  let instance = null
  const Npm = t.mock('../../lib/npm.js', {
    'proc-log': LEVELS.reduce((acc, l) => {
      acc[l] = (...args) => mock.logs.push([l, ...args])
      return acc
    }, {}),
    ...otherMocks,
  })

  class MockNpm extends Npm {
    constructor () {
      super()
      // npm.js tests need this restored to actually test this function!
      mock.npmOutput = this.output
      this.output = (...msg) => mock.outputs.push(msg)
      // Track if this test created something with its
      // constructor so we can all teardown methods
      // since those are handled in the exit handler
      instance = this
    }
  }

  mock.Npm = MockNpm

  t.afterEach(() => {
    mock.outputs.length = 0
    mock.logs.length = 0
  })

  t.teardown(() => {
    process.title = title
    process.execPath = execPath
    delete process.env.npm_command
    delete process.env.COLOR
    if (instance) {
      instance.logFile.off()
      instance.timers.off()
      instance.procLog.off()
      instance = null
    }
  })

  return mock
}

const realConfig = require('../../lib/utils/config')

// Basic npm fixture that you can give a config object that acts like
// npm.config You still need a separate flatOptions. Tests should migrate to
// using the real npm mock above
class MockNpm {
  constructor (base = {}) {
    this._mockOutputs = []
    this.isMockNpm = true
    this.base = base

    const config = base.config || {}

    for (const attr in base) {
      if (attr !== 'config') {
        this[attr] = base[attr]
      }
    }

    this.flatOptions = base.flatOptions || {}
    this.config = {
      // for now just set `find` to what config.find should return
      // this works cause `find` is not an existing config entry
      find: (k) => ({ ...realConfig.defaults, ...config })[k],
      get: (k) => ({ ...realConfig.defaults, ...config })[k],
      set: (k, v) => config[k] = v,
      list: [{ ...realConfig.defaults, ...config }],
    }
  }

  output (...msg) {
    if (this.base.output) {
      return this.base.output(msg)
    }
    this._mockOutputs.push(msg)
  }
}

const FakeMockNpm = (base = {}) => {
  if (base.log) {
    throw new Error('I need to find all of these')
  }
  return new MockNpm(base)
}

module.exports = {
  fake: FakeMockNpm,
  real: RealMockNpm,
}
