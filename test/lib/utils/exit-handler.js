const t = require('tap')
const os = require('os')
const fs = require('fs').promises
const EventEmitter = require('events')
const path = require('path')
const log = require('../../../lib/utils/log-shim')
const { real: mockNpm } = require('../../fixtures/mock-npm')

t.formatSnapshot = (obj) => {
  if (Array.isArray(obj)) {
    return obj
      .map((i) => Array.isArray(i) ? i.join(' ') : i)
      .join('\n')
  }
  return obj
}

t.cleanSnapshot = (path) => {
  const normalizePath = p => p
    .replace(/\\+/g, '/')
    .replace(/\r\n/g, '\n')
  return normalizePath(path)
    .replace(new RegExp(normalizePath(process.cwd()), 'g'), '{CWD}')
    // Config loading is dependent on env so strip those from snapshots
    .replace(/.*timing config:load:.*\n/gm, '')
    .replace(/Completed in \d+ms/g, 'Completed in {TIME}ms')
}

t.test('bootstrap tap before cutting off process ref', (t) => {
  t.ok('ok')
  t.end()
})

// Keep track of things to teardown globally
const teardown = []

// cut off process from script so that it won't quit the test runner
// while trying to call process.exit. This also needs to be done
// before mocking any npm internals since those emit events
// on whatever is assigned to the global process
const _process = process
process = Object.assign(
  new EventEmitter(),
  {
    argv: ['/node', ..._process.argv.slice(1)],
    cwd: _process.cwd,
    env: _process.env,
    version: 'v1.0.0',
    exit: (code) => {
      process.exitCode = code || process.exitCode || 0
      process.emit('exit', process.exitCode)
    },
    stdout: { write (_, cb) {
      cb()
    } },
    stderr: { write () {} },
    hrtime: _process.hrtime,
  }
)
teardown.push(() => process = _process)

// overrides OS type/release for cross platform snapshots
const _osType = os.type
const _osRelease = os.release
os.type = () => 'Foo'
os.release = () => '1.0.0'
teardown.push(() => {
  os.type = _osType
  os.release = _osRelease
})

t.teardown(() => {
  teardown.forEach((fn) => fn())
})

const mockExitHandler = async (t, {
  testdir = {},
  load = true,
  setNpm = true,
  config = {},
} = {}) => {
  // override for console errors in log handler
  const errors = []
  const _consoleError = console.error
  console.error = (err) => errors.push(err)

  const root = t.testdir(testdir)
  const { Npm, logMocks, ...rest } = mockNpm(t, {
    '../../package.json': {
      version: '1.0.0',
    },
  })

  let npm = null
  if (setNpm) {
    process.env.PREFIX = root
    process.env.npm_config_cache = root
    npm = new Npm()
    if (load) {
      await npm.load()
      npm.config.set('prefix', root)
      npm.config.set('cache', root)
      log.level = 'silent'
      for (const [k, v] of Object.entries(config)) {
        npm.config.set(k, v)
      }
    }
  }

  const exitHandler = t.mock('../../../lib/utils/exit-handler.js', {
    '../../../lib/utils/error-message.js': (err) => ({
      ...err,
      summary: [['ERR SUMMARY', err.message]],
      detail: [['ERR DETAIL', err.message]],
    }),
    ...logMocks,
  })

  if (npm) {
    exitHandler.setNpm(npm)
  }

  t.teardown((t) => {
    console.error = _consoleError
    log.level = 'silent'
    delete process.exitCode
    delete process.env.npm_config_cache
    delete process.env.PREFIX
    process.removeAllListeners('exit')
  })

  return {
    ...rest,
    errors,
    npm,
    exitHandler,
    asyncExitHandler: (...args) => new Promise(resolve => {
      process.once('exit', resolve)
      exitHandler(...args)
    }),
    debugFile: async () => {
      const logFiles = await Promise.all(npm.logFiles.map(f => fs.readFile(f)))
      return logFiles
        .flatMap((d) => d.toString().trim().split(os.EOL))
        .filter(Boolean)
        .join('\n')
    },
    timingFile: async () => {
      const data = await fs.readFile(path.resolve(root, '_timing.json'), 'utf8')
      return JSON.parse(data)
    },
  }
}

// Create errors with properties to be used in tests
const err = (message = '', options = {}, noStack = false) => {
  const e = Object.assign(
    new Error(message),
    typeof options !== 'object' ? { code: options } : options
  )
  e.stack = options.stack || `Error: ${message}`
  if (noStack) {
    delete e.stack
  }
  return e
}

t.only('handles unknown error with logs and debug file', async (t) => {
  const { exitHandler, debugFile, logs } = await mockExitHandler(t)

  exitHandler(err('Unknown error', 'ECODE'))

  const debugContent = await debugFile()

  t.equal(process.exitCode, 1)
  logs.forEach((l) => {
    t.match(debugContent, l.join(' ').replace(/\s\s/g, ' '), 'log appears in debug file')
  })
  t.equal(logs.length, debugContent.split('\n').length)
  t.match(logs.error, [
    ['code', 'ECODE'],
    ['ERR SUMMARY', 'Unknown error'],
    ['ERR DETAIL', 'Unknown error'],
  ])
  t.match(debugContent, /\d+ error code ECODE/)
  t.match(debugContent, /\d+ error ERR SUMMARY Unknown error/)
  t.match(debugContent, /\d+ error ERR DETAIL Unknown error/)
  t.matchSnapshot(logs, 'logs')
  t.matchSnapshot(debugContent, 'debug file contents')
})

t.test('exit handler never called - loglevel silent', async (t) => {
  const { logs, errors } = await mockExitHandler(t)
  process.emit('exit', 1)
  t.match(logs.error, [
    ['', /Exit handler never called/],
    ['', /error with npm itself/],
  ])
  t.strictSame(errors, [''], 'logs one empty string to console.error')
})

t.test('exit handler never called - loglevel notice', async (t) => {
  const { logs, errors } = await mockExitHandler(t)
  log.level = 'notice'
  process.emit('exit', 1)
  t.equal(process.exitCode, 1)
  t.match(logs.error, [
    ['', /Exit handler never called/],
    ['', /error with npm itself/],
  ])
  t.strictSame(errors, ['', ''], 'logs two empty strings to console.error')
})

t.test('exit handler never called - no npm', async (t) => {
  const { logs, errors } = await mockExitHandler(t, { setNpm: false })
  process.emit('exit', 1)
  t.equal(process.exitCode, 1)
  t.match(logs.error, [
    ['', /Exit handler never called/],
    ['', /error with npm itself/],
  ])
  t.strictSame(errors, [''], 'logs one empty string to console.error')
})

t.test('console.log output using --json', async (t) => {
  const { exitHandler, errors } = await mockExitHandler(t, {
    config: {
      json: true,
    },
  })

  exitHandler(err('Error: EBADTHING Something happened'))

  t.equal(process.exitCode, 1)
  t.same(
    JSON.parse(errors[0]),
    {
      error: {
        code: 'EBADTHING', // should default error code to E[A-Z]+
        summary: 'Error: EBADTHING Something happened',
        detail: 'Error: EBADTHING Something happened',
      },
    },
    'should output expected json output'
  )
})

t.test('throw a non-error obj', async (t) => {
  const { exitHandler, logs } = await mockExitHandler(t)

  exitHandler({
    code: 'ESOMETHING',
    message: 'foo bar',
  })

  t.equal(process.exitCode, 1)
  t.match(logs.error, [
    ['weird error', { code: 'ESOMETHING', message: 'foo bar' }],
  ])
})

t.test('throw a string error', async (t) => {
  const { exitHandler, logs } = await mockExitHandler(t)

  exitHandler('foo bar')

  t.equal(process.exitCode, 1)
  t.match(logs.error, [
    ['', 'foo bar'],
  ])
})

t.test('update notification', async (t) => {
  const { exitHandler, logs, npm } = await mockExitHandler(t)
  npm.updateNotification = 'you should update npm!'

  exitHandler()

  t.match(logs.notice, [
    ['', 'you should update npm!'],
  ])
})

t.test('npm.config not ready', async (t) => {
  const { exitHandler, logs, errors } = await mockExitHandler(t, {
    load: false,
  })

  exitHandler()

  t.equal(process.exitCode, 1)
  t.match(errors, [
    /Error: Exit prior to config file resolving./,
  ], 'should exit with config error msg')
  t.match(logs.verbose, [
    ['stack', /Error: Exit prior to config file resolving./],
  ], 'should exit with config error msg')
})

t.test('timing with no error', async (t) => {
  const { exitHandler, timingFile, timings, unfinished } = await mockExitHandler(t, {
    config: {
      timing: true,
    },
  })

  exitHandler()

  const timingFileData = await timingFile()

  t.equal(process.exitCode, 0)
  t.match(
    timingFileData,
    Object.keys(timings).reduce((acc, k) => {
      acc[k] = Number
      return acc
    }, {})
  )
  t.strictSame(unfinished, {})
  t.match(timingFileData, {
    command: [],
    version: '1.0.0',
    npm: Number,
    logfile: String,
    logfiles: [String],
  })
})

t.test('uses code from errno', async (t) => {
  const { exitHandler, logs } = await mockExitHandler(t)

  exitHandler(err('Error with errno', { errno: 127 }))
  t.equal(process.exitCode, 127)
  t.match(logs.error, [['errno', 127]])
})

t.test('uses code from number', async (t) => {
  const { exitHandler, logs } = await mockExitHandler(t)

  exitHandler(err('Error with code type number', 404))
  t.equal(process.exitCode, 404)
  t.match(logs.error, [['code', 404]])
})

t.test('uses all err special properties', async t => {
  const { exitHandler, logs } = await mockExitHandler(t)

  const keys = ['code', 'syscall', 'file', 'path', 'dest', 'errno']
  const properties = keys.reduce((acc, k) => {
    acc[k] = `${k}-hey`
    return acc
  }, {})

  exitHandler(err('Error with code type number', properties))
  t.equal(process.exitCode, 1)
  t.match(logs.error, keys.map((k) => [k, `${k}-hey`]), 'all special keys get logged')
})

t.test('verbose logs replace info on err props', async t => {
  const { exitHandler, logs } = await mockExitHandler(t)

  const keys = ['type', 'stack', 'statusCode', 'pkgid']
  const properties = keys.reduce((acc, k) => {
    acc[k] = `${k}-https://user:pass@registry.npmjs.org/`
    return acc
  }, {})

  exitHandler(err('Error with code type number', properties))
  t.equal(process.exitCode, 1)
  t.match(
    logs.verbose,
    keys.map((k) => [k, `${k}-https://user:***@registry.npmjs.org/`]),
    'all special keys get replaced'
  )
})

t.test('call exitHandler with no error', async (t) => {
  const { exitHandler, logs } = await mockExitHandler(t)

  exitHandler()

  t.equal(process.exitCode, 0)
  t.match(logs.error, [])
})

t.test('defaults to log error msg if stack is missing when unloaded', async (t) => {
  const { exitHandler, logs, errors } = await mockExitHandler(t, { load: false })

  exitHandler(err('Error with no stack', { code: 'ENOSTACK', errno: 127 }, true))
  t.equal(process.exitCode, 127)
  t.same(errors, ['Error with no stack'], 'should use error msg')
  t.match(logs.error, [
    ['code', 'ENOSTACK'],
    ['errno', 127],
  ])
})

t.test('exits uncleanly when only emitting exit event', async (t) => {
  const { logs } = await mockExitHandler(t)

  process.emit('exit')

  t.match(logs.error, [['', 'Exit handler never called!']])
  t.equal(process.exitCode, 1, 'exitCode coerced to 1')
  t.end()
})

t.test('do no fancy handling for shellouts', async t => {
  const { asyncExitHandler, npm, logs } = await mockExitHandler(t)

  npm.command = 'exec'

  const loudNoises = () =>
    logs.filter(([level]) => ['warn', 'error'].includes(level))

  t.test('shellout with a numeric error code', async t => {
    await asyncExitHandler(err('', 5))
    t.equal(process.exitCode, 5, 'got expected exit code')
    t.strictSame(loudNoises(), [], 'no noisy warnings')
  })

  t.test('shellout without a numeric error code (something in npm)', async t => {
    await asyncExitHandler(err('', 'banana stand'))
    t.equal(process.exitCode, 1, 'got expected exit code')
    // should log some warnings and errors, because something weird happened
    t.strictNotSame(loudNoises(), [], 'bring the noise')
    t.end()
  })

  t.test('shellout with code=0 (extra weird?)', async t => {
    await asyncExitHandler(Object.assign(new Error(), { code: 0 }))
    t.equal(process.exitCode, 1, 'got expected exit code')
    t.strictNotSame(loudNoises(), [], 'bring the noise')
  })

  t.end()
})
