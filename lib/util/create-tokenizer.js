'use strict'

module.exports = micromark

var assert = require('assert')
var characters = require('./characters')

var debug = false

// Characters.
var eof = NaN

// Methods.
var own = {}.hasOwnProperty
var assign = Object.assign

function micromark(initializer, from) {
  var resolveAlls = []
  var buffer = ''
  var index = 0
  var place = assign({}, from || {line: 1, column: 1, offset: index}, {
    index: index
  })

  // Parser state.
  var stack = [] // Current open tokens.
  var eventQueue = []

  var helpers = {
    slice: slice
  }

  var effects = {
    previous: eof,
    previousToken: null,
    consume: consume,
    enter: enter,
    exit: exit,
    createHookableState: createHookableState,
    createConstructAttempt: createConstructAttempt,
    createConstruct: createConstruct
  }

  var state = initializer(effects)

  return write

  function write(value) {
    var done = value === null

    if (done === false) {
      buffer += value
    }

    main(done)

    // To do: clear the queue for constructs that are done.

    // If we needed to buffer events due to `resolveAll`s, and we’re not done,
    // return an empty events list.
    if (done === false) {
      return []
    }

    // Otherwise, resolve, and exit.
    resolveAlls.forEach((resolveAll) => {
      eventQueue = resolveAll(eventQueue, helpers)
    })

    return eventQueue
  }

  //
  // Helpers.
  //

  function slice(token) {
    return buffer.slice(token.start.index, token.end.index)
  }

  //
  // State management.
  //

  // Main loop (note that `index` is modified by `consume`).
  function main(end) {
    // If `end`, we also feed an EOF.
    // Which is finally consumed by the last state.
    var offset = end ? 1 : 0

    while (index < buffer.length + offset) {
      if (debug) console.info('go:', state.name)
      state = state(buffer.charCodeAt(index))
    }
  }

  // Move a character forward.
  function consume(code) {
    assert.equal(typeof code, 'number', 'expected a numeric code')

    if (debug) console.info('consume:', [code])

    // Line ending; assumes CR is not used (that’s a to do).
    if (code === characters.lineFeed) {
      place.line++
      place.column = 1
    }
    // Anything else.
    else {
      place.column++
    }

    index++

    place.offset++
    place.index = index

    effects.previous = code
  }

  // Start a token.
  function enter(type) {
    var token = {type: type, start: now()}

    if (debug) console.group('enter:', type)

    eventQueue.push(['enter', token, helpers])

    stack.push(token)

    return token
  }

  // Stop a token.
  function exit(type) {
    var token

    assert.equal(
      stack[stack.length - 1].type,
      type,
      'expected exit token to match current token'
    )

    token = stack.pop()

    token.end = now()

    assert.notEqual(
      token.start.index,
      token.end.index,
      'expected non-empty token (`' + type + '`)'
    )

    if (debug) console.groupEnd()
    if (debug) console.info('exit:', token.type)

    eventQueue.push(['exit', token, helpers])

    effects.previousToken = token

    return token
  }

  // Get the current point.
  function now() {
    return assign({}, place)
  }

  function createHookableState(hooks, returnState, bogusState) {
    var keys = Object.keys(hooks)

    resolveAlls = resolveAlls.concat(
      keys
        .flatMap((k) => hooks[k])
        .map((h) => h.resolveAll)
        .filter(Boolean)
        .filter((d, i, a) => a.indexOf(d) === i)
    )

    /* istanbul ignore next - bogus is optimized, which may be useful later. */
    return keys.length === 0 ? bogusState : hooked

    function hooked(code) {
      if (code !== code) {
        return returnState(code)
      }

      if (own.call(hooks, code)) {
        return createConstructAttempt(hooks[code], returnState, bogusState)
      }

      return bogusState
    }
  }

  function createConstructAttempt(constructs, returnState, bogusState) {
    var multiple = 'length' in constructs
    var hookIndex = 0
    var startEventQueue = eventQueue.concat()
    var startPrevious = effects.previous
    var startPreviousToken = effects.previousToken
    var startIndex = index
    var startPlace = now()
    var startDepth = stack.length
    var construct = multiple ? constructs[hookIndex] : constructs

    eventQueue = []

    return construct.tokenize(effects, ok, nok)

    function ok() {
      // To do: resolve is horrible. Make it pretty.
      var resolve = construct.resolve || identity
      var resolveTo = construct.resolveTo || identity
      var tail

      eventQueue = resolveTo(
        startEventQueue.concat(resolve(eventQueue, helpers)),
        helpers
      )
      tail = eventQueue[eventQueue.length - 1]

      effects.previousToken = tail[1]
      assert.equal(tail[0], 'exit', 'expected end in exit')

      return returnState
    }

    function nok() {
      // Clear debugging.
      var n = 99
      if (debug) while (n--) console.groupEnd()

      // Reset.
      index = startIndex
      place = assign({}, startPlace)
      stack = stack.slice(0, startDepth)
      effects.previous = startPrevious
      effects.previousToken = startPreviousToken

      // Next construct.
      if (multiple && ++hookIndex < constructs.length) {
        eventQueue = []
        construct = constructs[hookIndex]
        return construct.tokenize(effects, ok, nok)
      }

      eventQueue = startEventQueue
      return bogusState
    }
  }

  function createConstruct(construct, returnState) {
    var startEventQueue = eventQueue.concat()

    eventQueue = []

    return construct.tokenize(effects, ok)

    function ok() {
      var resolve = construct.resolve || identity
      var resolveTo = construct.resolveTo || identity
      var tail

      eventQueue = resolveTo(
        startEventQueue.concat(resolve(eventQueue, helpers)),
        helpers
      )
      tail = eventQueue[eventQueue.length - 1]

      if (tail) {
        effects.previousToken = tail[1]
        assert.equal(tail[0], 'exit', 'expected end in exit')
      }

      return returnState
    }
  }
}

function identity(x) {
  return x
}