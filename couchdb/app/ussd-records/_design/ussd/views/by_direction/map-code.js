'use strict'

module.exports.map = function (doc) {
  if (doc.docType === 'ussd') {
    emit(doc.direction)
  }
}
