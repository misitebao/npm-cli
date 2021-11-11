const t = require('tap')

const makeShim = (mocks) => t.mock('../../../lib/utils/log-shim.js', mocks)

t.test('has properties', (t) => {
  const shim = makeShim()

  t.match(shim, {
    level: String,
    levels: {},

    gauge: {},
    stream: {},
    heading: undefined,

    enableColor: Function,
    disableColor: Function,
    enableUnicode: Function,
    disableUnicode: Function,
    enableProgress: Function,
    disableProgress: Function,

    notice: Function,
    error: Function,
    warn: Function,
    info: Function,
    verbose: Function,
    http: Function,
    silly: Function,
    pause: Function,
    resume: Function,
  })

  t.match(Object.keys(shim), [
    // Properties
    'level',
    'levels',
    'heading',
    'gauge',
    'stream',
    'tracker',
    // npmlog setup methods
    'useColor',
    'enableColor',
    'disableColor',
    'enableUnicode',
    'disableUnicode',
    'enableProgress',
    'disableProgress',
    'clearProgress',
    'showProgress',
    'newItem',
    'newGroup',
    // Log methods
    'notice',
    'error',
    'warn',
    'info',
    'verbose',
    'http',
    'silly',
    'pause',
    'resume',
  ])

  t.end()
})

t.test('works with npmlog/proclog proxy', t => {
  const procLog = { silly: () => 'SILLY' }
  const npmlog = { level: 'woo', enableColor: () => true }
  const shim = makeShim({ npmlog, 'proc-log': procLog })

  t.equal(shim.level, 'woo', 'can get a property')

  npmlog.level = 'hey'
  t.strictSame(
    [shim.level, npmlog.level],
    ['hey', 'hey'],
    'can get a property after update on npmlog'
  )

  shim.level = 'test'
  t.strictSame(
    [shim.level, npmlog.level],
    ['test', 'test'],
    'can get a property after update on shim'
  )

  t.ok(shim.enableColor(), 'can call method on shim to call npmlog')
  t.equal(shim.silly(), 'SILLY', 'can call method on proclog')
  t.throws(() => Object.defineProperty(shim, 'x', {}), 'cant define other properties')
  t.throws(() => shim.x = 100, 'cant set other properies')
  t.throws(() => delete shim.level, 'cant delete property')

  t.end()
})
