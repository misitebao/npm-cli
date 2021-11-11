const NPM_LOG = require('npmlog')
const PROC_LOG = require('proc-log')

const keys = {
  npmlog: {
    get: [
      'level',
      'levels',
      'heading',
      'gauge',
      'stream',
      'tracker',
    ],
    set: [
      'level',
      'heading',
    ],
    methods: [
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
    ],
    get all () {
      return [...new Set([...this.get, ...this.set, ...this.methods])]
    },
  },
  proclog: {
    get: [
      // Dont allow getting LEVELS yet since they
      // are used differently in npmlog
      // LEVELS,
    ],
    set: [],
    methods: Object.keys(PROC_LOG).filter((k) => k !== 'LEVELS'),
    get all () {
      return [...new Set([...this.get, ...this.set, ...this.methods])]
    },
  },
  get all () {
    return [...new Set([...this.npmlog.all, ...this.proclog.all])]
  },
}

const err = (action, prop, obj) =>
  new Error(`Could not ${action} prop on log shim: ${prop.toString()}`)
const value = (obj, prop) => {
  if (!(prop in obj)) {
    // throw err('get', prop, obj)
  }
  return typeof obj[prop] === 'function'
    ? obj[prop].bind(obj)
    : Reflect.get(obj, prop, obj)
}

// Proxy an empty object so nothing except what is
// explicitly defined gets called on npmlog directly
// This is helpful for now because it enabled npmlog
// and proc-log as normal in tests. This should all
// go away once npmlog isnt being called for display
const proxy = new Proxy({}, {
  as: (__, key) => keys.all.includes(key),
  ownKeys: () => keys.all,
  get: (__, prop) => {
    if (keys.proclog.all.includes(prop)) {
      return value(PROC_LOG, prop)
    } else if (keys.npmlog.all.includes(prop)) {
      return value(NPM_LOG, prop)
    }
    // Everything else is undefined
    // Cant throw here because it breaks tap asserts
  },
  defineProperty: (target, prop) => {
    if (keys.all.includes(prop)) {
      return Reflect.defineProperty(target, prop, {
        configurable: true,
        enumerable: true,
        writable: keys.npmlog.set.includes(prop) || keys.proclog.set.includes(prop),
        value: keys.proclog.all.includes(prop) ? PROC_LOG[prop] : NPM_LOG[prop],
      })
    }
    // Returning false throws an error for any other definitions
    return false
  },
  set: (__, prop, value) => {
    if (keys.npmlog.set.includes(prop)) {
      return Reflect.set(NPM_LOG, prop, value, NPM_LOG)
    } else if (keys.proclog.set.includes(prop)) {
      return Reflect.set(PROC_LOG, prop, value, PROC_LOG)
    }
    throw err('set', prop)
  },
  deleteProperty: (__, prop) => {
    throw err('delete', prop)
  },
})

// Define all the properies with an empty object which will call defineProperty in the proxy
// This is just so the object will log and can be viewed as expected
Object.defineProperties(proxy, keys.all.reduce((acc, key) => {
  acc[key] = {}
  return acc
}, {}))

module.exports = proxy
