const t = require('tap')

const { load: loadMockNpm, withEnvDir } = require('../fixtures/mock-npm.js')

const unsupportedMock = {
  checkForBrokenNode: () => {},
  checkForUnsupportedNode: () => {},
}

let exitHandlerCalled = null
let exitHandlerNpm = null
let exitHandlerCb
const exitHandlerMock = (...args) => {
  exitHandlerCalled = args
  if (exitHandlerCb) {
    exitHandlerCb()
  }
}
exitHandlerMock.setNpm = npm => {
  exitHandlerNpm = npm
}

const cliMock = async (t, mocks) => {
  withEnvDir(t, 'npm_config_cache')
  const { Npm, outputs, logMocks, logs } = await loadMockNpm(t, { mocks, init: false })
  const cli = t.mock('../../lib/cli.js', {
    '../../lib/npm.js': Npm,
    '../../lib/utils/update-notifier.js': async () => null,
    '../../lib/utils/unsupported.js': unsupportedMock,
    '../../lib/utils/exit-handler.js': exitHandlerMock,
    ...logMocks,
  })
  return {
    Npm,
    cli,
    outputs,
    logs: () => logs.filter(([l]) => ['verbose', 'info'].includes(l)),
  }
}

const processMock = proc => {
  const mocked = {
    ...process,
    on: () => {},
    ...proc,
  }
  // nopt looks at process directly
  process.argv = mocked.argv
  return mocked
}

const { argv } = process

t.afterEach(() => {
  process.argv = argv
  exitHandlerCalled = null
  exitHandlerNpm = null
})

t.test('print the version, and treat npm_g as npm -g', async t => {
  const proc = processMock({
    argv: ['node', 'npm_g', '-v'],
    version: process.version,
  })

  const { logs, cli, Npm, outputs } = await cliMock(t)
  await cli(proc)

  t.strictSame(proc.argv, ['node', 'npm', '-g', '-v'], 'npm process.argv was rewritten')
  t.strictSame(process.argv, ['node', 'npm', '-g', '-v'], 'system process.argv was rewritten')
  t.strictSame(logs(), [
    ['verbose', 'cli', proc.argv],
    ['info', 'using', 'npm@%s', Npm.version],
    ['info', 'using', 'node@%s', process.version],
  ])
  t.strictSame(outputs, [[Npm.version]])
  t.strictSame(exitHandlerCalled, [])
})

t.test('calling with --versions calls npm version with no args', async t => {
  t.plan(5)
  const proc = processMock({
    argv: ['node', 'npm', 'install', 'or', 'whatever', '--versions'],
  })
  const { logs, cli, Npm, outputs } = await cliMock(t, {
    '../../lib/commands/version.js': class Version {
      async exec (args) {
        t.strictSame(args, [])
      }
    },
  })

  await cli(proc)
  t.equal(proc.title, 'npm')
  t.strictSame(logs(), [
    ['verbose', 'cli', proc.argv],
    ['info', 'using', 'npm@%s', Npm.version],
    ['info', 'using', 'node@%s', process.version],
  ])

  t.strictSame(outputs, [])
  t.strictSame(exitHandlerCalled, [])
})

t.test('logged argv is sanitized', async t => {
  const proc = processMock({
    argv: [
      'node',
      'npm',
      'version',
      'https://username:password@npmjs.org/test_url_with_a_password',
    ],
  })
  const { logs, cli, Npm } = await cliMock(t, {
    '../../lib/commands/version.js': class Version {
      async exec (args) {}
    },
  })

  await cli(proc)
  t.equal(proc.title, 'npm')
  t.strictSame(logs(), [
    [
      'verbose',
      'cli',
      ['node', 'npm', 'version', 'https://username:***@npmjs.org/test_url_with_a_password'],
    ],
    ['info', 'using', 'npm@%s', Npm.version],
    ['info', 'using', 'node@%s', process.version],
  ])
})

t.test('print usage if no params provided', async t => {
  const proc = processMock({
    argv: ['node', 'npm'],
  })

  const { cli, outputs } = await cliMock(t)
  await cli(proc)
  t.match(outputs[0][0], 'Usage:', 'outputs npm usage')
  t.match(exitHandlerCalled, [], 'should call exitHandler with no args')
  t.ok(exitHandlerNpm, 'exitHandler npm is set')
  t.match(proc.exitCode, 1)
})

t.test('print usage if non-command param provided', async t => {
  const proc = processMock({
    argv: ['node', 'npm', 'tset'],
  })

  const { cli, outputs } = await cliMock(t)
  await cli(proc)
  t.match(outputs[0][0], 'Unknown command: "tset"')
  t.match(outputs[0][0], 'Did you mean this?')
  t.match(exitHandlerCalled, [], 'should call exitHandler with no args')
  t.ok(exitHandlerNpm, 'exitHandler npm is set')
  t.match(proc.exitCode, 1)
})

t.test('load error calls error handler', async t => {
  const proc = processMock({
    argv: ['node', 'npm', 'asdf'],
  })

  const err = new Error('test load error')
  const { cli } = await cliMock(t, {
    '../../lib/utils/config/index.js': {
      definitions: null,
      flatten: null,
      shorthands: null,
    },
    '@npmcli/config': class BadConfig {
      async load () {
        throw err
      }
    },
  })
  await cli(proc)
  t.strictSame(exitHandlerCalled, [err])
})
