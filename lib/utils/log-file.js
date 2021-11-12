const os = require('os')
const path = require('path')
const { format } = require('util')
const rimraf = require('rimraf')
const glob = require('glob')
const MiniPass = require('minipass')
const fsMiniPass = require('fs-minipass')
const log = require('./log-shim')
const withChownSync = require('./with-chown-sync')

const _logHandler = Symbol('logHandler')
const _formatLogItem = Symbol('formatLogItem')
const _getLogFileName = Symbol('getLogFileName')
const _openLogFile = Symbol('openLogFile')
const _cleanLogs = Symbol('cleanlogs')
const _endStream = Symbol('endStream')

class LogFiles {
  // If we write multiple log files we want them all to have the same
  // identifier for sorting and matching purposes
  #logId = new Date().toISOString().replace(/[.:]/g, '_')

  // Default to a plain minipass stream so we can buffer
  // initial writes before we know the cache location
  #logStream = null

  // We cap log files at a certain number of log events per file.
  // Note that each log event can write more than one line to the
  // file. Then we rotate log files once this number of events is reached
  #MAX_LOGS_PER_FILE = null

  // Now that we write logs continuously we need to have a backstop
  // here for infinite loops that still log. This is also partially handled
  // by the config.get('max-files') option, but this is a failsafe to
  // prevent runaway log file creation
  #MAX_LOG_FILES_PER_PROCESS = null

  #fileLogCount = 0
  #totalLogCount = 0
  #dir = null
  #maxFiles = null
  #files = []

  constructor ({
    maxLogsPerFile = 50_000,
    maxFilesPerProcess = 5,
  } = {}) {
    this.#MAX_LOGS_PER_FILE = maxLogsPerFile
    this.#MAX_LOG_FILES_PER_PROCESS = maxFilesPerProcess
    this.on()
  }

  on () {
    this.#logStream = new MiniPass()
    process.on('log', this[_logHandler])
  }

  off () {
    process.off('log', this[_logHandler])
    this[_endStream]()
  }

  config ({ dir, maxFiles }) {
    this.#dir = dir
    this.#maxFiles = maxFiles

    // Pipe our initial stream to our new file stream and
    // set that as the new log logstream for future writes
    this.#logStream = this.#logStream.pipe(this[_openLogFile]())

    // Kickoff cleaning process. This is async but it wont delete
    // our next log file since it deletes oldest first. Return the
    // result so it can be awaited in tests
    return this[_cleanLogs]()
  }

  log (...args) {
    this[_logHandler](...args)
  }

  get files () {
    return this.#files
  }

  [_endStream] (output) {
    if (this.#logStream) {
      // log.silly('logfile', `closed logfile: ${this.#logStream.path}`)
      this.#logStream.end(output)
      this.#logStream = null
    }
  }

  [_logHandler] = (level, ...args) => {
    // Ignore pause and resume events since we
    // write everything to the log file
    if (level === 'pause' || level === 'resume') {
      return
    }

    const logOutput = this[_formatLogItem](level, ...args)
    const isBuffered = this.#logStream instanceof MiniPass

    if (isBuffered) {
      // Cant do anything but buffer the output if we dont
      // have a file stream yet
      this.#logStream.write(logOutput)
      return
    }

    // Open a new log file if we've written too many logs to this one
    if (this.#fileLogCount >= this.#MAX_LOGS_PER_FILE) {
      // Write last chunk to the file and close it
      this[_endStream](logOutput)
      if (this.#files.length >= this.#MAX_LOG_FILES_PER_PROCESS) {
        // but if its way too many then we just stop listening
        this.off()
      } else {
        // otherwise we are ready for a new file for the next event
        this.#logStream = this[_openLogFile]()
      }
    } else {
      this.#logStream.write(logOutput)
    }
  }

  [_formatLogItem] (level, title, ...args) {
    this.#fileLogCount += 1
    this.#totalLogCount += 1

    const prefixes = [this.#totalLogCount, level]
    if (title) {
      prefixes.push(title)
    }
    const prefix = prefixes.join(' ')

    return format(...args)
      .trim()
      .split(/\r?\n/)
      .reduce((lines, line) =>
        lines += (prefix + ' ' + line).trim() + os.EOL,
      ''
      )
  }

  [_getLogFileName] (prefix, suffix) {
    return path.resolve(this.#dir, `${prefix}-debug-${suffix}.log`)
  }

  [_openLogFile] () {
    // Count in filename will be 0 indexed
    const count = this.#files.length

    // Pad with zeros so that our log files are always sorted properly
    // We never want to write files ending in `-9.log` and `-10.log` because
    // log file cleaning is done by deleting the oldest so in this example
    // `-10.log` would be deleted next
    const countDigits = this.#MAX_LOG_FILES_PER_PROCESS.toString().length

    const logStream = withChownSync(
      this[_getLogFileName](this.#logId, count.toString().padStart(countDigits, '0')),
      // Some effort was made to make the async, but we need to write logs
      // during process.on('exit') which has to be synchronous. So in order
      // to never drop log messages, it is easiest to make it sync all the time
      // and this was measured to be about 1.5% slower for 40k lines of output
      (f) => new fsMiniPass.WriteStreamSync(f, { flags: 'a' })
    )
    this.#files.push(logStream.path)
    this.#fileLogCount = 0

    // log.silly('logfile', `opened new logfile: ${logStream.path}`)

    return logStream
  }

  [_cleanLogs] () {
    log.silly('logfile', 'start cleaning logs')
    // module to clean out the old log files
    // this is a best-effort attempt.  if a rm fails, we just
    // log a message about it and move on.  We do return a
    // Promise that succeeds when we've tried to delete everything,
    // just for the benefit of testing this function properly.
    return new Promise((resolve, reject) => {
      glob(this[_getLogFileName]('*', '*'), (er, files) => {
        if (er) {
          return reject(er)
        }

        let pending = files.length - this.#maxFiles
        if (pending <= 0) {
          return resolve()
        }

        for (let i = 0; i < files.length - this.#maxFiles; i++) {
          rimraf(files[i], er => {
            if (er) {
              log.warn('logfile', 'failed to remove log file', files[i])
            }

            if (--pending === 0) {
              resolve()
            }
          })
        }
      })
    }).catch((e) => {
      log.warn('logfile', 'error cleaning log files', e)
    }).finally(() => {
      log.silly('logfile', 'finished cleaning logs')
    })
  }
}

module.exports = LogFiles
