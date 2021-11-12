const t = require('tap')
const Display = require('../../../lib/utils/display')

t.test('display', (t) => {
  const timers = new Display()
  t.ok(timers)
  t.end()
})
