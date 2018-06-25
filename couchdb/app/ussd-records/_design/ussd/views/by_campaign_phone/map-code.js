'use strict'

module.exports.map = function (doc) {
  if (doc.docType === 'people' && doc.campaignId) {
    emit([doc.campaignId, doc.phone])
  }
}
