const t = require('tap')
const fs = require('fs')
const path = require('path')

const completionScript = fs
  .readFileSync(path.resolve(__dirname, '../../../lib/utils/completion.sh'), { encoding: 'utf8' })
  .replace(/^#!.*?\n/, '')

const { load: _loadMockNpm } = require('../../fixtures/mock-npm')
const mockGlobal = require('../../fixtures/mock-global')

const loadMockCompletion = async (t, o = {}) => {
  const { global, windows, ...options } = o
  let resetGlobal = {}
  if (global) {
    resetGlobal = mockGlobal(t, ...global)
  }
  const res = await _loadMockNpm(t, {
    mocks: {
      '../../lib/utils/is-windows-shell.js': !!windows,
      ...options.mocks,
    },
    ...options,
  })
  const completion = await res.npm.cmd('completion')
  return {
    resetGlobal,
    completion,
    ...res,
  }
}

const loadMockCompletionComp = async (t, word, line) =>
  loadMockCompletion(t, {
    global: [process.env, {
      COMP_CWORD: word,
      COMP_LINE: line,
      COMP_POINT: line.length,
    }],
  })

t.test('completion', async t => {
  t.test('completion completion', async t => {
    const { outputs, completion, prefix } = await loadMockCompletion(t, {
      testdir: {
        '.bashrc': 'aaa',
        '.zshrc': 'aaa',
      },
    })
    mockGlobal(t, process.env, { HOME: prefix })

    await completion.completion({ w: 2 })
    t.matchSnapshot(outputs, 'both shells')
  })

  t.test('completion completion no known shells', async t => {
    const { outputs, completion, prefix } = await loadMockCompletion(t)
    mockGlobal(t, process.env, { HOME: prefix })

    await completion.completion({ w: 2 })
    t.matchSnapshot(outputs, 'no responses')
  })

  t.test('completion completion wrong word count', async t => {
    const { outputs, completion } = await loadMockCompletion(t)

    await completion.completion({ w: 3 })
    t.matchSnapshot(outputs, 'no responses')
  })

  t.test('dump script when completion is not being attempted', async t => {
    let errorHandler, data
    const { completion, resetGlobal } = await loadMockCompletion(t, {
      global: [process.stdout, {
        on: (event, handler) => {
          errorHandler = handler
          resetGlobal.on()
        },
        write: (chunk, callback) => {
          data = chunk
          process.nextTick(() => {
            callback()
            errorHandler({ errno: 'EPIPE' })
          })
          resetGlobal.write()
        },

      }],
    })

    await completion.exec({})
    t.equal(data, completionScript, 'wrote the completion script')
  })

  t.test('dump script exits correctly when EPIPE is emitted on stdout', async t => {
    let errorHandler, data
    const { completion, resetGlobal } = await loadMockCompletion(t, {
      global: [process.stdout, {
        on: (event, handler) => {
          if (event === 'error') {
            errorHandler = handler
          }
          resetGlobal.on()
        },
        write: (chunk, callback) => {
          data = chunk
          process.nextTick(() => {
            errorHandler({ errno: 'EPIPE' })
            callback()
          })
          resetGlobal.write()
        },
      }],
    })

    await completion.exec({})
    t.equal(data, completionScript, 'wrote the completion script')
  })

  t.test('single command name', async t => {
    const { outputs, completion } = await loadMockCompletionComp(t, 1, 'npm conf')

    await completion.exec(['npm', 'conf'])
    t.matchSnapshot(outputs, 'single command name')
  })

  t.test('multiple command names', async t => {
    const { outputs, completion } = await loadMockCompletionComp(t, 1, 'npm a')

    await completion.exec(['npm', 'a'])
    t.matchSnapshot(outputs, 'multiple command names')
  })

  t.test('completion of invalid command name does nothing', async t => {
    const { outputs, completion } = await loadMockCompletionComp(t, 1, 'npm compute')

    await completion.exec(['npm', 'compute'])
    t.matchSnapshot(outputs, 'no results')
  })

  t.test('subcommand completion', async t => {
    const { outputs, completion } = await loadMockCompletionComp(t, 2, 'npm access ')

    await completion.exec(['npm', 'access', ''])
    t.matchSnapshot(outputs, 'subcommands')
  })

  t.test('filtered subcommands', async t => {
    const { outputs, completion } = await loadMockCompletionComp(t, 2, 'npm access p')

    await completion.exec(['npm', 'access', 'p'])
    t.matchSnapshot(outputs, 'filtered subcommands')
  })

  t.test('commands with no completion', async t => {
    const { outputs, completion } = await loadMockCompletionComp(t, 2, 'npm adduser ')

    // quotes around adduser are to ensure coverage when unescaping commands
    await completion.exec(['npm', "'adduser'", ''])
    t.matchSnapshot(outputs, 'no results')
  })

  t.test('flags', async t => {
    const { outputs, completion } = await loadMockCompletionComp(t, 2, 'npm install --v')

    await completion.exec(['npm', 'install', '--v'])
    t.matchSnapshot(outputs, 'flags')
  })

  t.test('--no- flags', async t => {
    const { outputs, completion } = await loadMockCompletionComp(t, 2, 'npm install --no-v')

    await completion.exec(['npm', 'install', '--no-v'])
    t.matchSnapshot(outputs, 'flags')
  })

  t.test('double dashes escape from flag completion', async t => {
    const { outputs, completion } = await loadMockCompletionComp(t, 2, 'npm -- install --')

    await completion.exec(['npm', '--', 'install', '--'])
    t.matchSnapshot(outputs, 'full command list')
  })

  t.test('completion cannot complete options that take a value in mid-command', async t => {
    const { outputs, completion } = await loadMockCompletionComp(t, 2, 'npm --registry install')

    await completion.exec(['npm', '--registry', 'install'])
    t.matchSnapshot(outputs, 'does not try to complete option arguments in the middle of a command')
  })
})

t.test('windows without bash', async t => {
  const { outputs, completion } = await loadMockCompletion(t, { windows: true })
  await t.rejects(
    completion.exec({}),
    { code: 'ENOTSUP', message: /completion supported only in MINGW/ },
    'returns the correct error'
  )
  t.matchSnapshot(outputs, 'no output')
})
