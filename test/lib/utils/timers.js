const t = require('tap')
const Timers = require('../../../lib/utils/timers')

t.test('timers', (t) => {
  const timers = new Timers()
  t.ok(timers)
  t.end()
})
