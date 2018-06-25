'use strict'

module.exports.map = function (doc) {
  if (doc.docType === 'ussd') {
    var phoneAndDirection = [doc.phone, doc.direction].join('-')
    emit([phoneAndDirection, doc.createdOn])
  }
}
