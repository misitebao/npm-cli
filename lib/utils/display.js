const { inspect } = require('util')
const npmlog = require('npmlog')
const log = require('./log-shim.js')
const { explain } = require('./explain-eresolve.js')

const _logHandler = Symbol('logHandler')
const _timerHandler = Symbol('timerHandler')
const _eresolveWarn = Symbol('eresolveWarn')
const _log = Symbol('log')

// Explicitly call these on npmlog and not log shim
// This is the final place we should hit npmlog before
// removing it.
class Display {
  #timers = null

  constructor ({ timers }) {
    // pause by default until config is loaded
    log.pause()
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
    log.tracker.removeAllListeners()
    console.log(log.tracker)
  }

  config (config) {
    const {
      color,
      timing,
      loglevel,
      unicode,
      progress,
      heading = 'npm',
    } = config

    // XXX: decouple timing from loglevel
    if (timing && loglevel === 'notice') {
      log.level = 'timing'
    } else {
      log.level = loglevel
    }

    log.heading = heading

    if (color) {
      log.enableColor()
    } else {
      log.disableColor()
    }

    if (unicode) {
      log.enableUnicode()
    } else {
      log.disableUnicode()
    }

    // Progress is on stderr so see if term supports that
    const stderrTTY = process.stderr.isTTY
    const dumbTerm = process.env.TERM === 'dumb'
    const stderrNotDumb = stderrTTY && !dumbTerm
    // if it's more than error, don't show progress
    const quiet = log.levels[log.level] > log.levels.error

    if (progress && stderrNotDumb && !quiet) {
      log.enableProgress()
    } else {
      log.disableProgress()
    }

    // Resume displaying logs now that we have config
    log.resume()
  }

  [_timerHandler] = (name, ms) => {
    npmlog.timing(name, `Completed in ${ms}ms`)
  }

  [_logHandler] = (level, ...args) => {
    try {
      this[_log](level, ...args)
    } catch (ex) {
      try {
        // if it crashed once, it might again!
        npmlog.verbose(`attempt to log ${inspect(args)} crashed`, ex)
      } catch (ex2) {
        console.error(`attempt to log ${inspect(args)} crashed`, ex)
      }
    }
  }

  [_log] (level, ...args) {
    return this[_eresolveWarn](level, ...args) || npmlog[level](...args)
  }

  // Also (and this is a really inexcusable kludge), we patch the
  // log.warn() method so that when we see a peerDep override
  // explanation from Arborist, we can replace the object with a
  // highly abbreviated explanation of what's being overridden.
  [_eresolveWarn] (level, heading, message, expl) {
    if (level === 'warn' &&
        heading === 'ERESOLVE' &&
        expl && typeof expl === 'object'
    ) {
      npmlog[level](heading, message)
      npmlog[level]('', explain(expl, log.useColor(), 2))
      // Return true to short circuit other log in chain
      return true
    }
  }
}

module.exports = Display
