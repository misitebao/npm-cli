const originalPathKey = process.env.PATH ? 'PATH' : process.env.Path ? 'Path' : 'path'
const last = (arr) => arr[arr.length - 1]
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)

const getGlobalAncestors = (keys) =>
  keys.split('.').reduce((acc, k) => {
    const value = last(acc)[k]
    acc.push(value)
    return acc
  }, [global])

// A weird getter that can look up keys on nested objects but also
// match keys with dots in their names, eg { 'process.env': { TERM: 'a' } }
// can be looked up with the key 'process.env.TERM'
const get = (obj, fullKey, childKey) => {
  if (has(obj, fullKey)) {
    return childKey ? get(obj[fullKey], childKey) : obj[fullKey]
  } else {
    const lastDot = fullKey.lastIndexOf('.')
    return lastDot === -1 ? undefined : get(
      obj,
      fullKey.slice(0, lastDot),
      fullKey.slice(lastDot + 1) + (childKey ? `.${childKey}` : '')
    )
  }
}

// { a: 1, b: { c: 2 } } => ['a', 'b.c']
const getKeys = (values, p = '', acc = []) =>
  Object.entries(values).reduce((memo, [k, value]) => {
    const key = p ? `${p}.${k}` : k
    return value && typeof value === 'object' && !Array.isArray(value)
      ? getKeys(value, key, memo)
      : memo.concat(key)
  }, acc)

// Walk prototype chain to get first available descriptor
const getPropertyDescriptor = (obj, key, fullKey) => {
  if (fullKey.toUpperCase() === 'PROCESS.ENV.PATH') {
    // if getting original env.path value, use cross platform compatible key
    key = originalPathKey
  }
  let d = Object.getOwnPropertyDescriptor(obj, key)
  while (!d) {
    obj = Object.getPrototypeOf(obj)
    if (!obj) {
      return
    }
    d = Object.getOwnPropertyDescriptor(obj, key)
  }
  return d
}

class MockGlobals {
  #cache = new Map()
  #resets = []
  #defaultDescriptor = {
    configurable: true,
    writable: true,
    enumerable: true,
  }

  teardown () {
    this.#resets.forEach(r => r.reset(true))
  }

  registerGlobals (globals, { replace = false } = {}) {
    const resets = this.createResets(globals, { replace })
    this.#resets.push(...resets)
    return resets.reduce((acc, r) => {
      acc[r.fullKey] = r.reset
      return acc
    }, {})
  }

  createResets (g, { replace }) {
    const keys = replace ? Object.keys(g) : getKeys(g)
    return keys.map(k => this.set(k, g))
  }

  cacheKey (k) {
    return `__${k}__`
  }

  pushDescriptor (key, value) {
    const cache = this.#cache.get(this.cacheKey(key))
    if (cache) {
      this.#cache.get(this.cacheKey(key)).push(value)
    } else {
      this.#cache.set(this.cacheKey(key), [value])
    }
    return value
  }

  popDescriptor (key) {
    const cache = this.#cache.get(this.cacheKey(key))
    if (!cache) {
      return null
    }
    const value = cache.pop()
    if (!cache.length) {
      this.#cache.delete(this.cacheKey(key))
    }
    return value
  }

  createReset (parent, key, fullKey) {
    const res = {
      fullKey,
      key,
      reset: (teardown) => {
        const popped = this.popDescriptor(fullKey)
        if (popped === null) {
          return
        }
        const index = this.#resets.findIndex((v) => v === res)
        if (!teardown && index > -1) {
          this.#resets.splice(index, 1)
        }
        return popped
          ? Object.defineProperty(parent, key, popped)
          : (delete parent[key])
      },
    }
    return res
  }

  set (fullKey, globals) {
    const values = getGlobalAncestors(fullKey)
    const parent = values[values.length - 2]

    const key = last(fullKey.split('.'))
    const value = get(globals, fullKey)

    const currentDescriptor = getPropertyDescriptor(parent, key, fullKey)
    this.pushDescriptor(fullKey, currentDescriptor)

    const reset = this.createReset(parent, key, fullKey)

    if (value === undefined) {
      delete parent[key]
    } else {
      const newDescriptor = { ...(currentDescriptor || this.#defaultDescriptor) }
      if (newDescriptor.get) {
        newDescriptor.get = () => value
      } else {
        newDescriptor.value = value
      }
      Object.defineProperty(parent, key, newDescriptor)
    }

    return reset
  }
}

const cache = new Map()

const mockGlobals = (t, globals, options) => {
  const hasInstance = cache.has(t)
  const instance = hasInstance ? cache.get(t) : new MockGlobals()
  const reset = instance.registerGlobals(globals, options)
  if (!hasInstance) {
    cache.set(t, instance)
    t.teardown(() => {
      instance.teardown()
      cache.delete(t)
    })
  }
  return { reset }
}

module.exports = mockGlobals
