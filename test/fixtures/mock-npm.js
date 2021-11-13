const { title, execPath } = process
const mockLogs = require('./mock-logs')

// Eventually this should default to having a prefix of an empty testdir, and
// awaiting npm.load() unless told not to (for npm tests for example).  Ideally
// the prefix of an empty dir is inferred rather than explicitly set  
const RealMockNpm = (t, otherMocks = {}, options = {}) => {
  let instance = null
  const mock = {}
  mock.logs = []
  mock.outputs = []
  mock.timers = {}
  mock.joinedOutput = () => {
    return mock.outputs.map(o => o.join(' ')).join('\n')
  }
  mock.filteredLogs = (filter) => {
    // Split on first ':' only since prefix can contain ':'
    const [title, prefix] = typeof filter === 'string' ? filter.split(/:(.+)/) : []
    const f = typeof filter === 'function'
      ? filter
      // Filter on title and optionally prefix
      : ([t, p]) => t === title && (prefix ? p === prefix : true)
    return mock.logs
      .filter(f)
      // If we filter on the prefix also then just return
      // the message, otherwise return both
      // The message can be of arbitrary length
      // but if theres only one part then unwrap and return that
      .map(([__, p, ...m]) => prefix ? m.length <= 1 ? m[0] : m : [p, ...m])
  }

  // Merge default mocks for logging with whatever mocks were
  // passed in.
  // XXX: this shouldn't be necessary and we should find a way
  // to mock just logs but for now npmlog methods are mocked
  // across many of the older tests
  const logMocks = mockLogs((...args) => mock.logs.push(args), otherMocks)
  mock.logMocks = logMocks

  const Npm = t.mock('../../lib/npm.js', {
    ...otherMocks,
    ...logMocks,
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
    mock.timers = {}
  })

  t.teardown(() => {
    process.title = title
    process.execPath = execPath
    delete process.env.npm_command
    delete process.env.COLOR
    if (instance) {
      instance.unload()
      instance = null
    }
  })

  return mock
}

const LoadMockNpm = async (t, options = {}) => {
  const {
    mocks = {},
    testdir = {},
    config = {},
  } = options
  const dir = t.testdir(testdir)
  const { Npm, ...rest } = RealMockNpm(t, mocks)
  const npm = new Npm()
  process.env.npm_config_cache = dir
  await npm.load()
  npm.prefix = dir
  npm.cache = dir
  for (const [k, v] of Object.entries(config)) {
    npm.config.set(k, v)
  }
  return {
    npm,
    ...rest,
  }
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
  return new MockNpm(base)
}

module.exports = {
  fake: FakeMockNpm,
  real: RealMockNpm,
  load: LoadMockNpm,
}
