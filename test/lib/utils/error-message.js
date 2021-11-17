const t = require('tap')
const path = require('path')
const { load: _loadMockNpm } = require('../../fixtures/mock-npm.js')

t.cleanSnapshot = p => {
  const cwd = new RegExp(process.cwd(), 'g')
  return p.replace(cwd, '{CWD}')
}

const {
  getuid: getuidActual,
  getgid: getgidActual,
  arch: archActual,
  version: versionActual,
  platform: platformActual,
} = process

t.before(() => {
  // make a bunch of stuff consistent for snapshots
  process.getuid = () => 867
  process.getgid = () => 5309
  Object.defineProperty(process, 'arch', {
    value: 'x64',
    configurable: true,
  })
  Object.defineProperty(process, 'version', {
    value: '123.456.789-node',
    configurable: true,
  })
})

t.afterEach(() => {
  Object.defineProperty(process, 'platform', {
    value: 'posix',
    configurable: true,
  })
})

t.teardown(() => {
  Object.defineProperty(process, 'getuid', {
    value: getuidActual,
    configurable: true,
  })
  Object.defineProperty(process, 'getgid', {
    value: getgidActual,
    configurable: true,
  })
  Object.defineProperty(process, 'arch', {
    value: archActual,
    configurable: true,
  })
  Object.defineProperty(process, 'version', {
    value: versionActual,
    configurable: true,
  })
  Object.defineProperty(process, 'platform', {
    value: platformActual,
    configurable: true,
  })
})

const loadMockNpm = async (t, { load = true, windows = false, command, testdir } = {}) => {
  const { npm, ...rest } = await _loadMockNpm(t, {
    load,
    testdir,
    mocks: {
      '../../package.json': {
        version: '123.456.789-npm',
      },
    },
    config: {
      'node-version': '99.99.99',
    },
  })
  if (command !== undefined) {
    npm.command = command
  }
  if (windows) {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    })
  }
  return {
    npm,
    ...rest,
  }
}

const errorMessage = (er, { mocks, logMocks, npm } = {}) => {
  return t.mock('../../../lib/utils/error-message.js', {
    ...mocks,
    // XXX ???
    get '../../../lib/utils/is-windows.js' () {
      return process.platform === 'win32'
    },
    // XXX: this is ugh but it passes in the same mocks from npm to error message
    // which is important because mock-npm mocks loggers by default
    // but they are required separately in each file. So the error message
    // and npm have different refernces to the logs in their mocks. We should find
    // a way to either globally mock some modules or require modules
    // in a single place and pass them around internally
    ...logMocks,
  })(er, npm)
}

t.test('just simple messages', async t => {
  const npm = await loadMockNpm(t, { command: 'audit' })
  const codes = [
    'ENOAUDIT',
    'ENOLOCK',
    'ECONNREFUSED',
    'ENOGIT',
    'EPUBLISHCONFLICT',
    'EISGIT',
    'EEXIST',
    'ENEEDAUTH',
    'ECONNRESET',
    'ENOTFOUND',
    'ETIMEDOUT',
    'EAI_FAIL',
    'EBADENGINE',
    'ENOSPC',
    'EROFS',
    'ENOENT',
    'EMISSINGARG',
    'EUNKNOWNTYPE',
    'EINVALIDTYPE',
    'ETOOMANYARGS',
    'ETARGET',
    'E403',
    'ERR_SOCKET_TIMEOUT',
  ]
  t.plan(codes.length)
  codes.forEach(async code => {
    const path = '/some/path'
    const pkgid = 'some@package'
    const file = '/some/file'
    const stack = 'dummy stack trace'
    const er = Object.assign(new Error('foo'), {
      code,
      path,
      pkgid,
      file,
      stack,
    })
    t.matchSnapshot(errorMessage(er, npm))
  })
})

t.test('replace message/stack sensistive info', async t => {
  const npm = await loadMockNpm(t, { command: 'audit' })
  const path = '/some/path'
  const pkgid = 'some@package'
  const file = '/some/file'
  const stack = 'dummy stack trace at https://user:pass@registry.npmjs.org/'
  const message = 'Error at registry: https://user:pass@registry.npmjs.org/'
  const er = Object.assign(new Error(message), {
    code: 'ENOAUDIT',
    path,
    pkgid,
    file,
    stack,
  })
  t.matchSnapshot(errorMessage(er, npm))
})

t.test('bad engine without config loaded', async t => {
  const npm = await loadMockNpm(t, { load: false })
  const path = '/some/path'
  const pkgid = 'some@package'
  const file = '/some/file'
  const stack = 'dummy stack trace'
  const er = Object.assign(new Error('foo'), {
    code: 'EBADENGINE',
    path,
    pkgid,
    file,
    stack,
  })
  t.matchSnapshot(errorMessage(er, npm))
})

t.test('enoent without a file', async t => {
  const npm = await loadMockNpm(t)
  const path = '/some/path'
  const pkgid = 'some@package'
  const stack = 'dummy stack trace'
  const er = Object.assign(new Error('foo'), {
    code: 'ENOENT',
    path,
    pkgid,
    stack,
  })
  t.matchSnapshot(errorMessage(er, npm))
})

t.test('enolock without a command', async t => {
  const npm = await loadMockNpm(t, { command: null })
  const path = '/some/path'
  const pkgid = 'some@package'
  const file = '/some/file'
  const stack = 'dummy stack trace'
  const er = Object.assign(new Error('foo'), {
    code: 'ENOLOCK',
    path,
    pkgid,
    file,
    stack,
  })
  t.matchSnapshot(errorMessage(er, npm))
})

t.test('default message', async t => {
  const npm = await loadMockNpm(t)
  t.matchSnapshot(errorMessage(new Error('error object'), npm))
  t.matchSnapshot(errorMessage('error string', npm))
  t.matchSnapshot(errorMessage(Object.assign(new Error('cmd err'), {
    cmd: 'some command',
    signal: 'SIGYOLO',
    args: ['a', 'r', 'g', 's'],
    stdout: 'stdout',
    stderr: 'stderr',
  }), npm))
})

t.test('args are cleaned', async t => {
  const npm = await loadMockNpm(t)
  t.matchSnapshot(errorMessage(Object.assign(new Error('cmd err'), {
    cmd: 'some command',
    signal: 'SIGYOLO',
    args: ['a', 'r', 'g', 's', 'https://evil:password@npmjs.org'],
    stdout: 'stdout',
    stderr: 'stderr',
  }), npm))
})

t.test('eacces/eperm', async t => {
  const runTest = (windows, loaded, cachePath, cacheDest) => async t => {
    const npm = await loadMockNpm(t, { windows, load: loaded })
    const path = `${cachePath ? npm.cache : '/not/cache/dir'}/path`
    const dest = `${cacheDest ? npm.cache : '/not/cache/dir'}/dest`
    const er = Object.assign(new Error('whoopsie'), {
      code: 'EACCES',
      path,
      dest,
      stack: 'dummy stack trace',
    })

    t.matchSnapshot(errorMessage(er, npm))
    t.matchSnapshot(npm.logs.verbose)
  }

  for (const windows of [true, false]) {
    for (const loaded of [true, false]) {
      for (const cachePath of [true, false]) {
        for (const cacheDest of [true, false]) {
          const m = JSON.stringify({ windows, loaded, cachePath, cacheDest })
          t.test(m, runTest(windows, loaded, cachePath, cacheDest))
        }
      }
    }
  }
})

t.test('json parse', t => {
  t.test('merge conflict in package.json', async t => {
    const testdir = {
      'package.json': `
{
  "array": [
<<<<<<< HEAD
    100,
    {
      "foo": "baz"
    },
||||||| merged common ancestors
    1,
=======
    111,
    1,
    2,
    3,
    {
      "foo": "bar"
    },
>>>>>>> a
    1
  ],
  "a": {
    "b": {
<<<<<<< HEAD
      "c": {
        "x": "bbbb"
      }
||||||| merged common ancestors
      "c": {
        "x": "aaaa"
      }
=======
      "c": "xxxx"
>>>>>>> a
    }
  }
}
`,
    }
    const npm = await loadMockNpm(t, { testdir })
    const { argv } = process
    t.teardown(() => {
      process.argv = argv
    })
    process.argv = ['arg', 'v']
    t.matchSnapshot(errorMessage(Object.assign(new Error('conflicted'), {
      code: 'EJSONPARSE',
      path: path.resolve(npm.prefix, 'package.json'),
    }), npm))
    t.end()
  })

  t.test('just regular bad json in package.json', async t => {
    const testdir = {
      'package.json': 'not even slightly json',
    }
    const npm = await loadMockNpm(t, { testdir })
    const { argv } = process
    t.teardown(() => {
      process.argv = argv
    })
    process.argv = ['arg', 'v']
    t.matchSnapshot(errorMessage(Object.assign(new Error('not json'), {
      code: 'EJSONPARSE',
      path: path.resolve(npm.prefix, 'package.json'),
    }), npm))
    t.end()
  })

  t.test('json somewhere else', async t => {
    const testdir = {
      'blerg.json': 'not even slightly json',
    }
    const npm = await loadMockNpm(t, { testdir })
    const { argv } = process
    t.teardown(() => {
      process.argv = argv
    })
    process.argv = ['arg', 'v']
    t.matchSnapshot(errorMessage(Object.assign(new Error('not json'), {
      code: 'EJSONPARSE',
      path: path.resolve(npm.prefix, 'blerg.json'),
    }), npm))
    t.end()
  })

  t.end()
})

t.test('eotp/e401', async t => {
  const npm = await loadMockNpm(t)

  t.test('401, no auth headers', t => {
    t.matchSnapshot(errorMessage(Object.assign(new Error('nope'), {
      code: 'E401',
    }), npm))
    t.end()
  })

  t.test('401, no message', t => {
    t.matchSnapshot(errorMessage({
      code: 'E401',
    }, npm))
    t.end()
  })

  t.test('one-time pass challenge code', t => {
    t.matchSnapshot(errorMessage(Object.assign(new Error('nope'), {
      code: 'EOTP',
    }), npm))
    t.end()
  })

  t.test('one-time pass challenge message', t => {
    const message = 'one-time pass'
    t.matchSnapshot(errorMessage(Object.assign(new Error(message), {
      code: 'E401',
    }), npm))
    t.end()
  })

  t.test('www-authenticate challenges', t => {
    const auths = [
      'Bearer realm=do, charset="UTF-8", challenge="yourself"',
      'Basic realm=by, charset="UTF-8", challenge="your friends"',
      'PickACardAnyCard realm=friday, charset="UTF-8"',
      'WashYourHands, charset="UTF-8"',
    ]
    t.plan(auths.length)
    for (const auth of auths) {
      t.test(auth, t => {
        const er = Object.assign(new Error('challenge!'), {
          headers: {
            'www-authenticate': [auth],
          },
          code: 'E401',
        })
        t.matchSnapshot(errorMessage(er, npm))
        t.end()
      })
    }
  })
})

t.test('404', async t => {
  const npm = await loadMockNpm(t)

  t.test('no package id', t => {
    const er = Object.assign(new Error('404 not found'), { code: 'E404' })
    t.matchSnapshot(errorMessage(er, npm))
    t.end()
  })
  t.test('you should publish it', t => {
    const er = Object.assign(new Error('404 not found'), {
      pkgid: 'yolo',
      code: 'E404',
    })
    t.matchSnapshot(errorMessage(er, npm))
    t.end()
  })
  t.test('name with warning', t => {
    const er = Object.assign(new Error('404 not found'), {
      pkgid: new Array(215).fill('x').join(''),
      code: 'E404',
    })
    t.matchSnapshot(errorMessage(er, npm))
    t.end()
  })
  t.test('name with error', t => {
    const er = Object.assign(new Error('404 not found'), {
      pkgid: 'node_modules',
      code: 'E404',
    })
    t.matchSnapshot(errorMessage(er, npm))
    t.end()
  })
  t.test('cleans sensitive info from package id', t => {
    const er = Object.assign(new Error('404 not found'), {
      pkgid: 'http://evil:password@npmjs.org/not-found',
      code: 'E404',
    })
    t.matchSnapshot(errorMessage(er, npm))
    t.end()
  })
})

t.test('bad platform', async t => {
  const npm = await loadMockNpm(t)

  t.test('string os/arch', t => {
    const er = Object.assign(new Error('a bad plat'), {
      pkgid: 'lodash@1.0.0',
      current: {
        os: 'posix',
        cpu: 'x64',
      },
      required: {
        os: '!yours',
        cpu: 'x420',
      },
      code: 'EBADPLATFORM',
    })
    t.matchSnapshot(errorMessage(er, npm))
    t.end()
  })
  t.test('array os/arch', t => {
    const er = Object.assign(new Error('a bad plat'), {
      pkgid: 'lodash@1.0.0',
      current: {
        os: 'posix',
        cpu: 'x64',
      },
      required: {
        os: ['!yours', 'mine'],
        cpu: ['x867', 'x5309'],
      },
      code: 'EBADPLATFORM',
    })
    t.matchSnapshot(errorMessage(er, npm))
    t.end()
  })
})

t.test('explain ERESOLVE errors', async t => {
  const npm = await loadMockNpm(t)
  const EXPLAIN_CALLED = []

  const er = Object.assign(new Error('could not resolve'), {
    code: 'ERESOLVE',
  })

  t.matchSnapshot(errorMessage(er, {
    ...npm,
    mocks: {
      '../../../lib/utils/explain-eresolve.js': {
        report: (...args) => {
          EXPLAIN_CALLED.push(args)
          return 'explanation'
        },
      },
    },
  }))
  t.match(EXPLAIN_CALLED, [[
    er,
    false,
    path.resolve(npm.cache, 'eresolve-report.txt'),
  ]])
})
