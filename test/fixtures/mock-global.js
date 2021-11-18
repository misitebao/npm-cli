const { Test } = require('tap')

const defaultDescriptor = { configurable: true, writable: true, enumerable: true }

// Walk prototype chain to get property descriptor
const getPrototypePropertyDescriptor = (obj, key) => {
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

const createReset = (o, key) => {
  const descriptor = getPrototypePropertyDescriptor(o, key)
  return {
    key,
    descriptor,
    reset: () => descriptor
      ? Object.defineProperty(o, key, descriptor)
      : (delete o[key]),
  }
}

// Set new value on obj and return fn to reset it
const set = (o, key, value) => {
  const { descriptor, reset } = createReset(o, key)
  if (value === undefined) {
    delete o[key]
  } else {
    const newDescriptor = { ...(descriptor || defaultDescriptor) }
    if (newDescriptor.get) {
      newDescriptor.get = () => value
    } else {
      newDescriptor.value = value
    }
    Object.defineProperty(o, key, newDescriptor)
  }
  return {
    key,
    reset,
  }
}

const createTeardown = (t, ...args) => {
  t.teardown(() => args.forEach((d) => d.reset()))
  return args.reduce((acc, d) => {
    acc[d.key] = d.reset
    return acc
  }, {})
}

const findTap = (t, o, ...args) => {
  // global object and tap can be passed in any order
  if (!(t instanceof Test)) {
    [t, o] = [o, t]
  }
  return [t, o, ...args]
}

// call tap before/teardown to setup and remove property descriptors
const mock = (...args) => {
  const [t, o, props] = findTap(...args)
  const mocks = Object.entries(props).map(e => set(o, ...e))
  return createTeardown(t, ...mocks)
}

const reset = (...args) => {
  const [t, o, ...keys] = findTap(...args)
  const reset = keys.map(k => createReset(o, k))
  return createTeardown(t, ...reset)
}

// a fn that will only curry the if called with a single arg
const curryFirst = (func) => {
  const curried = (...args1) => args1.length === 1
    ? (...args2) => curried(...args1.concat(args2))
    : func(...args1)
  return curried
}

module.exports = curryFirst(mock)
module.exports.reset = curryFirst(reset)
