const { title, execPath } = process
const os = require('os')
const fs = require('fs').promises
const path = require('path')
const mockLogs = require('./mock-logs')
const log = require('../../lib/utils/log-shim')

const RealMockNpm = (t, otherMocks = {}) => {
  let instance = null

  const mockedLogs = mockLogs(otherMocks)
  const mock = {
    logMocks: mockedLogs.mocks,
    logs: mockedLogs.logs,
    outputs: [],
    joinedOutput () {
      return mock.outputs
        .map(o => o.join(' '))
        .join('\n')
    },
    timers: {
      get unfinished () {
        return instance.unfinishedTimers
      },
      get finished () {
        return instance.finishedTimers
      },
    },
  }

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

  // After each child test reset mock data so a single
  // npm instance can be tested across multiple child tests
  t.afterEach(() => {
    mock.logs.length = 0
    mock.outputs.length = 0
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

const withEnvDir = (t, key, dir) => {
  const { env: { [key]: _value } } = process

  process.env[key] = typeof dir === 'string'
    ? dir
    : t.testdir(dir)

  t.teardown(() => {
    process.env[_value] = _value
  })

  return process.env[key]
}

const LoadMockNpm = async (t, {
  init = true,
  load = true,
  testdir = {},
  config = {},
  mocks = {},
} = {}) => {
  const { Npm, ...rest } = RealMockNpm(t, mocks)

  const npm = init ? new Npm() : null
  const shouldLoad = npm && load

  const dir = t.testdir({ prefix: testdir, cache: {} })
  const prefix = withEnvDir(t, 'npm_config_prefix', path.join(dir, 'prefix'))
  const cache = withEnvDir(t, 'npm_config_cache', path.join(dir, 'cache'))
  withEnvDir(t, 'PREFIX', prefix)

  if (shouldLoad) {
    await npm.load()
    if (prefix) {
      npm.prefix = prefix
    }
  }

  const { loglevel, ...restConfig } = config
  if (shouldLoad) {
    for (const [k, v] of Object.entries(restConfig)) {
      npm.config.set(k, v)
    }
    if (loglevel) {
      // Log level is set on log singleton for now
      // XXX: remove with npmlog
      log.level = loglevel
      npm.config.set('loglevel', loglevel)
    }
  }

  return {
    ...rest,
    npm,
    prefix,
    cache,
    debugFile: async () => {
      const logFiles = await Promise.all(npm.logFiles.map(f => fs.readFile(f)))
      return logFiles
        .flatMap((d) => d.toString().trim().split(os.EOL))
        .filter(Boolean)
        .join('\n')
    },
    timingFile: async () => {
      const data = await fs.readFile(path.resolve(cache, '_timing.json'), 'utf8')
      return JSON.parse(data) // XXX: this files if multiple timings are written
    },
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
  withEnvDir,
}
