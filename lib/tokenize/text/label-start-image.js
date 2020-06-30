exports.tokenize = tokenizeLabelStartImage

var characters = require('../../util/characters')

function tokenizeLabelStartImage(effects, ok, nok) {
  return start

  function start(code) {
    /* istanbul ignore next - used when hooking into multiple characters */
    if (code !== characters.exclamationMark) return nok(code)

    effects.enter('potentialLabelStartImage')
    effects.consume(code)

    return open
  }

  function open(code) {
    if (code === characters.leftSquareBracket) {
      effects.consume(code)
      effects.exit('potentialLabelStartImage')
      return ok(code)
    }

    return nok(code)
  }
}