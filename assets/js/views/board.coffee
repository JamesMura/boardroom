class boardroom.views.Board extends Backbone.View
  el: '.board'
  groupViews: []

  events:
    'dblclick': 'requestNewCard'

  initialize: (attributes) ->
    @$el.data 'view', @
    { @socket } = attributes
    @initializeSocketEventHandlers()
    @initializeGroups()

  initializeSocketEventHandlers: ->
    @socket.on 'joined', @onJoined
    @socket.on 'connect', @onConnect
    @socket.on 'disconnect', @onDisconnect
    @socket.on 'reconnecting', @onReconnecting
    @socket.on 'reconnect', @onReconnect
    @socket.on 'group.create', @onGroupCreate
    @socket.on 'card.update', @onCardUpdate
    @socket.on 'card.delete', @onCardDelete

  initializeGroups: ->
    groups = @model.get('groups')
    @displayNewGroup group for group in groups if groups

  displayStatus: (status) ->
    @$('#connection-status').html status
    modal = @$('#connection-status-modal')
    if status then modal.show() else modal.hide()

  findView: (id) ->
    $("##{id}").data('view')

  requestNewCard: (event) ->
    return unless event.target.className == 'board'
    maxZ = if @groupViews.length
        _.max(@groupViews, (view) -> view.zIndex()).zIndex()
      else
        0
    @socket.emit 'group.create',
      boardId: @model.get('_id')
      creator: @model.get('user_id')
      x: parseInt (event.pageX - $(event.target).offset().left) - 10
      y: parseInt (event.pageY - $(event.target).offset().top)  - 10
      z: maxZ + 1
      focus: true

  displayNewGroup: (data) ->
    if data.set? # check if data is a BackboneModel or not
      data.set 'board', @model
      group = data 
    else
      group = new boardroom.models.Group _.extend(data, board: @model)
    groupView = new boardroom.views.Group
      model: group
      socket: @socket
    @$el.append groupView.render().el
    @groupViews.push groupView

  # --------- socket handlers ---------

  onGroupCreate: (data) =>
    @displayNewGroup data

  onCardUpdate: (data) =>
    cardView = @findView data._id
    cardView.update data

  onCardDelete: (id) =>
    cardView = @findView id
    cardView.remove()

  onConnect: =>
    @socket.emit 'join', user_id: @model.get('user_id')

  onDisconnect: =>
    @displayStatus 'Disconnected'

  onReconnect: =>
    @displayStatus null

  onReconnecting: =>
    @displayStatus 'Reconnecting...'

  onJoined: (data) =>
    @model.addUser data
