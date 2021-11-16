
const log = require('./log-shim.js')
const errorMessage = require('./error-message.js')
let npm = null

process.on('exit', (code) => {
  log.verbose('exit', errorMessage(code))
})

const exitHandler = (err) => {
  log.verbose('exitHandler', errorMessage(err))
  return npm
}

module.exports = exitHandler
module.exports.setNpm = (_npm) => {
  npm = _npm
}
