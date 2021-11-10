const NPM_LOG = require('npmlog')
const PROC_LOG = require('proc-log')

const logKeys = {
  get: [
    'level',
    'levels',
    'heading',
    'progressEnabled',
    'gauge',
    'stream',
  ],
  set: [
    'level',
    'heading',
  ],
  npmlogMethods: [
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
  ],
  procLogMethods: PROC_LOG.LEVELS || [],
}

const allKeys = [
  ...new Set(Object.values(logKeys).flatMap(v => v)),
]

// Proxy an empty object so nothing except what is
// explicitly defined gets called on npmlog directly
// This is helpful for now because it enabled npmlog
// and proc-log as normal in tests. This should all
// go away once npmlog isnt being called for display
const proxy = new Proxy({}, {
  get: (__, prop) => {
    if (logKeys.procLogMethods.includes(prop)) {
      // Call method on proc-log
      return (...args) => PROC_LOG[prop](...args)
    } if (logKeys.get.includes(prop)) {
      // Return a properly from npmlog
      return Reflect.get(NPM_LOG, prop)
    } else if (logKeys.npmlogMethods.includes(prop)) {
      // Call a method on npmlog
      const origMethod = NPM_LOG[prop]
      return function (...args) {
        return origMethod.apply(this, args)
      }
    }
    // Everything else is undefined
    // Cant throw here because it breaks tap asserts
  },
  defineProperty: (target, prop) => {
    if (allKeys.includes(prop)) {
      return Reflect.defineProperty(target, prop, {
        configurable: true,
        enumerable: true,
        writable: logKeys.set.includes(prop),
        value: logKeys.procLogMethods.includes(prop) ? PROC_LOG[prop] : NPM_LOG[prop],
      })
    }
    return false
  },
  set: (__, prop, value) => {
    if (logKeys.set.includes(prop)) {
      return Reflect.set(NPM_LOG, prop, value)
    }
    throw new Error('Could not set prop on log shim')
  },
  deleteProperty: () => {
    throw new Error('Could not delete prop on log shim')
  },
  has: (__, key) => allKeys.includes(key),
  ownKeys: () => allKeys,
})

// Define all the properies which will call defineProperty in the proxy
// This is just so the object will log and can be viewed as expected
Object.defineProperties(proxy, allKeys.reduce((acc, key) => {
  acc[key] = {}
  return acc
}, {}))

module.exports = proxy
