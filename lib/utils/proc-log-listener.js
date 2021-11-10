const { inspect } = require('util')
const npmlog = require('npmlog')

const _logHandler = Symbol('logHandler')
const _timerHandler = Symbol('timerHandler')

// Explicitly call these on npmlog and not log shim
// This is the final place we should hit npmlog before
// removing it.
class ProcLogListener {
  #timers = null

  constructor ({ timers }) {
    this.#timers = timers
    this.on()
  }

  on () {
    process.on('log', this[_logHandler])
    this.#timers.on(this[_timerHandler])
  }

  off () {
    process.off('log', this[_logHandler])
    this.#timers.on(this[_timerHandler])
  }

  [_timerHandler] = (name, ms) => {
    npmlog.timing(name, `Completed in ${ms}ms`)
  }

  [_logHandler] = (level, ...args) => {
    try {
      npmlog[level](...args)
    } catch (ex) {
      try {
        // if it crashed once, it might again!
        npmlog.verbose(`attempt to log ${inspect(args)} crashed`, ex)
      } catch (ex2) {
        console.error(`attempt to log ${inspect(args)} crashed`, ex)
      }
    }
  }
}

module.exports = ProcLogListener
