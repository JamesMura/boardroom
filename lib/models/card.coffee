{ mongoose } = require './db'

CardSchema = new mongoose.Schema
  groupId: String
  creator: String
  authors: Array
  plusAuthors: Array
  text: String
  colorIndex: Number
  deleted: Boolean
  focus: Boolean
  created: Date
  updated: Date

CardSchema.pre 'save', (next) ->
  @created = new Date() unless @created?
  @updated = new Date()
  next()

CardSchema.statics =
  findByGroupId: (groupId, callback) ->
    @find { groupId }, callback

CardSchema.methods =
  updateAttributes: (attributes, callback) ->
    for attribute in ['text', 'colorIndex', 'deleted', 'groupId', 'plusAuthors'] when attributes[attribute]?
      @[attribute] = attributes[attribute]
    if attributes.author?
      @authors.push attributes.author unless attributes.author in @authors
    @save (error, card) ->
      callback error, card

  isRemovable: (callback) ->
    callback true

Card = mongoose.model 'Card', CardSchema

module.exports = Card
