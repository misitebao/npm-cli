const { title, execPath } = process
const { promisify } = require('util')
const rimraf = promisify(require('rimraf'))
const mockLogs = require('./mock-logs')

// Eventually this should default to having a prefix of an empty testdir, and
// awaiting npm.load() unless told not to (for npm tests for example).  Ideally
// the prefix of an empty dir is inferred rather than explicitly set
const RealMockNpm = (t, otherMocks = {}) => {
  let instance = null

  const mockedLogs = mockLogs(otherMocks)
  const mock = {
    logMocks: mockedLogs.mocks,
    logs: mockedLogs.logs,
    outputs: [],
    timings: {},
    unfinished: {},
    joinedOutput () {
      return mock.outputs
        .map(o => o.join(' '))
        .join('\n')
    },
  }

  const timeHandler = (name) => {
    mock.unfinished[name] = Date.now()
  }
  const timeEndHandler = (name) => {
    mock.timings[name] = Date.now() - mock.unfinished[name]
    delete mock.unfinished[name]
  }

  process.on('time', timeHandler)
  process.on('timeEnd', timeEndHandler)

  const Npm = t.mock('../../lib/npm.js', {
    ...otherMocks,
    ...mock.logMocks,
  })

  mock.Npm = class MockNpm extends Npm {
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

  // After each child test reset mock data
  // so a single npm instance can be tested across commands
  // XXX: make this behavior opt in so tests can accumulate logs
  t.afterEach(() => {
    mock.logs.length = 0
    mock.outputs.length = 0
    mock.timers = {}
  })

  t.teardown(() => {
    process.title = title
    process.execPath = execPath
    delete process.env.npm_command
    delete process.env.COLOR
    process.off('time', timeHandler)
    process.off('timeEnd', timeEndHandler)
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
  t.teardown(async () => {
    await rimraf(dir)
  })
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
