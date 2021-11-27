const t = require('tap')
const mockGlobals = require('../../fixtures/mock-globals')

const originals = {
  platform: process.platform,
  error: console.error,
  stderrOn: process.stderr.on,
  stderrWrite: process.stderr.write,
  shell: process.env.SHELL,
  home: process.env.HOME,
  argv: process.argv,
}
const callConsole = (...args) => console.error(...args)

t.test('console', async t => {
  await t.test('mocks', async (t) => {
    const errors = []
    mockGlobals(t, {
      'console.error': (...args) => errors.push(...args),
    })

    callConsole(1)
    callConsole(2)
    callConsole(3)
    t.strictSame(errors, [1, 2, 3], 'i got my errors')
  })

  t.equal(console.error, originals.error)
})

t.test('platform', async (t) => {
  t.equal(process.platform, originals.platform)

  await t.test('posix', async (t) => {
    mockGlobals(t, { 'process.platform': 'posix' })
    t.equal(process.platform, 'posix')

    await t.test('win32 --> woo', async (t) => {
      mockGlobals(t, { 'process.platform': 'win32' })
      t.equal(process.platform, 'win32')

      mockGlobals(t, { 'process.platform': 'woo' })
      t.equal(process.platform, 'woo')
    })

    t.equal(process.platform, 'posix')
  })

  t.equal(process.platform, originals.platform)
})

t.test('manual reset', async t => {
  let errorHandler, data

  const { reset } = mockGlobals(t, {
    'process.stderr.on': (__, handler) => {
      errorHandler = handler
      reset['process.stderr.on']()
    },
    'process.stderr.write': (chunk, callback) => {
      data = chunk
      process.nextTick(() => {
        errorHandler({ errno: 'EPIPE' })
        callback()
      })
      reset['process.stderr.write']()
    },
  })

  await new Promise((res, rej) => {
    process.stderr.on('error', er => er.errno === 'EPIPE' ? res() : rej(er))
    process.stderr.write('hey', res)
  })

  t.equal(process.stderr.on, originals.stderrOn)
  t.equal(process.stderr.write, originals.stderrWrite)
  t.equal(data, 'hey', 'handles EPIPE errors')
  t.ok(errorHandler)
})

t.test('multiple with manual reset', async (t) => {
  t.equal(process.platform, originals.platform)

  await t.test('a', async (t) => {
    mockGlobals(t, { 'process.platform': 'a' })
    t.equal(process.platform, 'a')

    await t.test('b, c', async (t) => {
      const { reset: resetB } = mockGlobals(t, { 'process.platform': 'b' })
      t.equal(process.platform, 'b')

      const { reset: resetC } = mockGlobals(t, { 'process.platform': 'c' })
      t.equal(process.platform, 'c')

      resetC['process.platform']()
      t.equal(process.platform, 'b')

      resetB['process.platform']()
      t.equal(process.platform, 'a')
    })

    t.equal(process.platform, 'a')
  })

  t.equal(process.platform, originals.platform)
})

t.test('too many resets', async (t) => {
  await t.test('single reset', async t => {
    const { reset } = mockGlobals(t, { 'process.platform': 'z' })
    t.equal(process.platform, 'z')

    reset['process.platform']()
    t.equal(process.platform, originals.platform)

    reset['process.platform']()
    reset['process.platform']()
    reset['process.platform']()
    t.equal(process.platform, originals.platform)
  })

  t.equal(process.platform, originals.platform)
})

t.test('object mode', async t => {
  await t.test('mocks', async t => {
    const home = t.testdir()
    let data

    mockGlobals(t, {
      process: {
        stderr: {
          write: (chunk, callback) => {
            data = chunk
            process.nextTick(() => callback())
          },
        },
        env: {
          HOME: home,
        },
      },
    })

    await new Promise((res) => {
      process.stderr.write('hey', res)
    })

    t.equal(data, 'hey', 'handles EPIPE errors')
    t.equal(process.env.HOME, home)
  })

  t.equal(process.env.HOME, originals.home)
  t.equal(process.stderr.write, originals.stderrWrite)
})

t.test('mixed object/string mode', async t => {
  await t.test('mocks', async t => {
    const home = t.testdir()

    mockGlobals(t, {
      'process.env': {
        HOME: home,
        TEST: '1',
      },
    })

    t.equal(process.env.HOME, home)
    t.equal(process.env.TEST, '1')
  })

  t.equal(process.env.HOME, originals.home)
  t.equal(process.env.TEST, undefined)
})

t.test('date', async t => {
  await t.test('mocks', async t => {
    mockGlobals(t, {
      'Date.now': () => 100,
      'Date.prototype.toISOString': () => 'DDD',
    })
    t.equal(Date.now(), 100)
    t.equal(new Date().toISOString(), 'DDD')
  })

  t.ok(Date.now() > 100)
  t.ok(new Date().toISOString().includes('T'))
})

t.test('argv', async t => {
  await t.test('argv', async t => {
    mockGlobals(t, {
      'process.argv': ['node', 'woo'],
    })
    t.strictSame(process.argv, ['node', 'woo'])
  })

  t.strictSame(process.argv, originals.argv)
})

t.skip('multiple mocks and resets', async (t) => {
  t.test('in order', async t => {
    mockGlobals(t, { 'process.platform': 'a' })
    t.equal(process.platform, 'a')

    await t.test('b, c', async (t) => {
      const { reset: resetB } = mockGlobals(t, { 'process.platform': 'b' })
      t.equal(process.platform, 'b')

      const { reset: resetC } = mockGlobals(t, { 'process.platform': 'c' })
      t.equal(process.platform, 'c')

      resetC['process.platform']()
      resetC['process.platform']()
      resetC['process.platform']()
      resetC['process.platform']()
      t.equal(process.platform, 'b')

      resetB['process.platform']()
      resetB['process.platform']()
      resetB['process.platform']()
      resetB['process.platform']()
      t.equal(process.platform, 'a')
    })

    t.equal(process.platform, 'a')
  })

  t.test('out of order', async (t) => {
    mockGlobals(t, { 'process.platform': 'a' })
    t.equal(process.platform, 'a')

    await t.test('b, c', async (t) => {
      const { reset: resetB } = mockGlobals(t, { 'process.platform': 'b' })
      t.equal(process.platform, 'b')

      const { reset: resetC } = mockGlobals(t, { 'process.platform': 'c' })

      resetB['process.platform']()
      resetB['process.platform']()
      resetB['process.platform']()
      resetB['process.platform']()
      t.equal(process.platform, 'a')

      resetC['process.platform']()
      resetC['process.platform']()
      resetC['process.platform']()
      resetC['process.platform']()
      t.equal(process.platform, 'b')
    })

    t.equal(process.platform, 'a')
  })
})
