const NPM_LOG = require('npmlog')
const PROC_LOG = require('proc-log')

// Sets getter and optionally a setter
// otherwise setting should throw
const accessors = (obj, set) => (k) => ({
  get: () => obj[k],
  set: set ? (v) => (obj[k] = v) : () => {
    throw new Error(`Cant set ${k}`)
  },
})

// Set the value to a bound function on the object
const value = (obj) => (k) => ({ value: (...args) => obj[k].apply(obj, args) })

const properties = {
  // npmlog getters/setters
  level: accessors(NPM_LOG, true),
  heading: accessors(NPM_LOG, true),
  levels: accessors(NPM_LOG),
  gauge: accessors(NPM_LOG),
  stream: accessors(NPM_LOG),
  tracker: accessors(NPM_LOG),
  // npmlog methods
  useColor: value(NPM_LOG),
  enableColor: value(NPM_LOG),
  disableColor: value(NPM_LOG),
  enableUnicode: value(NPM_LOG),
  disableUnicode: value(NPM_LOG),
  enableProgress: value(NPM_LOG),
  disableProgress: value(NPM_LOG),
  clearProgress: value(NPM_LOG),
  showProgress: value(NPM_LOG),
  newItem: value(NPM_LOG),
  newGroup: value(NPM_LOG),
  // proclog methods
  notice: value(PROC_LOG),
  error: value(PROC_LOG),
  warn: value(PROC_LOG),
  info: value(PROC_LOG),
  verbose: value(PROC_LOG),
  http: value(PROC_LOG),
  silly: value(PROC_LOG),
  pause: value(PROC_LOG),
  resume: value(PROC_LOG),
}

const descriptors = Object.entries(properties).reduce((acc, [k, v]) => {
  acc[k] = { enumerable: true, ...v(k) }
  return acc
}, {})

// Create an object with the allowed properties
// from npm log and all the logging methods
// from proc log
// XXX: this should go away and requires of this
// should be replaced with proc-log + new display
module.exports = Object.freeze(Object.defineProperties({}, descriptors))
