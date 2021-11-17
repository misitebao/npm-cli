const { title, execPath } = process
const os = require('os')
const fs = require('fs').promises
const path = require('path')
const mockLogs = require('./mock-logs')
const log = require('../../lib/utils/log-shim')

const RealMockNpm = (t, otherMocks = {}) => {
  // Track if this test created something with its
  // constructor so we can all teardown methods
  // since those are handled in the exit handler
  let instance = null

  const mockedLogs = mockLogs(otherMocks)
  const mock = {
    logMocks: mockedLogs.mocks,
    logs: mockedLogs.logs,
    outputs: [],
    joinedOutput: () => mock.outputs.map(o => o.join(' ')).join('\n'),
    unfinishedTimers: () => instance && instance.unfinishedTimers,
    finishedTimers: () => instance && instance.finishedTimers,
  }

  const Npm = t.mock('../../lib/npm.js', {
    ...otherMocks,
    ...mock.logMocks,
  })

  mock.Npm = class MockNpm extends Npm {
    constructor () {
      super()
      instance = this
    }

    // npm.js tests need this restored to actually test this function!
    originalOutput (...args) {
      super.output(...args)
    }

    output (...args) {
      mock.outputs.push(args)
    }
  }

  // After each child test reset mock data so a single
  // npm instance can be tested across multiple child tests
  t.afterEach(() => {
    mock.logs.length = 0
    mock.outputs.length = 0
    if (instance) {
      instance.reset()
    }
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
  load = init,
  testdir = {},
  config = {},
  mocks = {},
} = {}) => {
  const { Npm, ...rest } = RealMockNpm(t, mocks)

  if (!init && load) {
    throw new Error('cant `load` without `init`')
  }

  const _level = log.level
  t.teardown(() => {
    log.level = _level
  })

  if (config.loglevel) {
    // Set Log level as early as possible since it is set
    // on the npmlog singleton and shared across everything
    log.level = config.loglevel
  }

  const npm = init ? new Npm() : null
  const shouldLoad = npm && load

  const dir = t.testdir({ prefix: testdir, cache: {} })

  // Set env vars to testdirs so they are available when load is run
  // XXX: remove this for a less magic solution in the future
  const prefix = withEnvDir(t, 'npm_config_prefix', path.join(dir, 'prefix'))
  const cache = withEnvDir(t, 'npm_config_cache', path.join(dir, 'cache'))
  withEnvDir(t, 'PREFIX', prefix)

  if (npm) {
    // When this instance gets loaded the first time set the prefix
    // to match the env var and set and configs passed in
    const _load = npm.load
    let initialLoad = true
    npm.load = async (...args) => {
      await _load.apply(npm, ...args)
      if (initialLoad) {
        // XXX: not sure why this is needed but tests broke without it
        npm.prefix = prefix
        for (const [k, v] of Object.entries(config)) {
          npm.config.set(k, v)
        }
        if (config.loglevel) {
        // Set global loglevel *again* since it possibly got reset during load
        // XXX: remove with npmlog
          log.level = config.loglevel
        }
        initialLoad = false
      }
    }
  }

  if (shouldLoad) {
    await npm.load()
  }

  return {
    ...rest,
    npm,
    prefix,
    cache,
    dir,
    debugFile: async () => {
      const logFiles = await Promise.all(npm.logFiles.map(f => fs.readFile(f)))
      return logFiles
        .flatMap((d) => d.toString().trim().split(os.EOL))
        .filter(Boolean)
        .join('\n')
    },
    timingFile: async () => {
      const data = await fs.readFile(path.resolve(cache, '_timing.json'), 'utf8')
      return JSON.parse(data) // XXX: this fails if multiple timings are written
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
