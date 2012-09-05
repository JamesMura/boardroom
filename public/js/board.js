function adjustTextarea(textarea) {
  $(textarea).css('height','auto');
  if ($(textarea).innerHeight() < textarea.scrollHeight)
    $(textarea).css('height',textarea.scrollHeight + 14);
  analyzeCardContent(textarea);
}

function analyzeCardContent(textarea) {
  //var content = $(textarea).val();
  var $card = $(textarea).parents('.card');
  $card.removeClass('i-wish i-like');
  var matches = $(textarea).val().match(/^i (like|wish)/i);
  if (matches) {
    $card.addClass('i-' + matches[1]);
  }
}

var board = null, boardroom = null, domLoaded = false, begun=false, focusNextCreate = false, cardLocks = {};
$.getJSON( document.location.pathname+'/info', function(data) { board = data; begin(); });
$(function() { domLoaded = true; begin(); });

function begin() {
  if ( ! board || ! domLoaded || begun ) return;
  begun = true;

  function cleanHTML( str ) {
    return (str||'').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g,'&amp;');
  }

  function avatar( user ) {
    return '/user/avatar/' + encodeURIComponent( user );
  }

  var socketURL =  'http://' + document.location.host + '/boardNamespace/' + board.name;
  var socket = io.connect(socketURL);
  boardroom = boardroomFactory(socket, board);
  socket.on( 'move', onMoveCard );
  socket.on( 'add', onCreateCard );
  socket.on( 'delete', onDeleteCard );
  socket.on( 'text', onText );
  socket.on( 'joined', function( user ) { board.users[user.user_id] = user; } );
  socket.on('connect', function() { socket.emit('join', {user_id:board.user_id}); } );
  socket.on('title_changed', function(title) { $('#title').val(title); });
  socket.on('color', onColor);
  socket.on('boardDeleted', function () { alert('This board has been deleted by its owner.'); window.location = '/boards'; });
  socket.on('group', boardroom.onGroup);
  socket.on('createdGroup', boardroom.group.onCreated);

  for (var i=0,card; card = board.cards[i]; i++)
    onCreateCard( card );

  for (var groupId in board.groups) {
    if (board.groups.hasOwnProperty(groupId)) {
      board.groups[groupId].cardIds.forEach(function(cardId) {
        $('#' + cardId).data('group-id', groupId);
      });
    }
  }

  // clear outdated locks
  setInterval(function() {
    var currentTime = new Date().getTime();
    for ( var cardId in cardLocks ) {
      var timeout = cardLocks[cardId].move ? 500 : 5000;
      if ( currentTime - cardLocks[cardId].updated > timeout ) {
        $('#'+cardId+' .notice').fadeOut(100);
        $('#'+cardId+' textarea').removeAttr('disabled');
        delete cardLocks[cardId];
      }
    }
  }, 100 );

  function onMoveCard( coords ) {
    var $card = $('#'+coords._id)
      .css('left', coords.x )
      .css('top', coords.y );

    if ( ! $('.notice', $card).is(':visible') ) {
      notice( coords._id, coords.moved_by, coords.moved_by );
      cardLocks[coords._id] = { user_id:coords.moved_by, updated:new Date().getTime(), move:true };
    }
    boardroom.moveToTop($card);
  }

  function onDeleteCard( card ) {
    $('#'+card._id).remove();
  }

  function notice( cardId, userId, message ) {
    $('#'+cardId+' .notice').html('<img src="' + avatar(userId) + '"/><span>' + cleanHTML( message ) + '</span>')
                            .show();
  }

  function createCard() {
    focusNextCreate = true;
    socket.emit('add', {
      boardName:board.name,
      author:board.user_id,
      x: parseInt(Math.random() * 700),
      y: parseInt(Math.random() * 400)
    });
  }

  function addAuthor( cardId, author ) {
    if ( $('#'+cardId+' .authors img[title="'+author+'"]').length == 0 )
      $('#'+cardId+' .authors').append('<img src="'+avatar(author)+'" title="'+cleanHTML(author)+'"/>');
  }

  function onCreateCard( data ) {
    var $card = $('<div class="card"><img class="delete" src="/images/delete.png"/><div class="notice"></div>'
                  +'<div class="colors">'
                  +[0,1,2,3,4].map(function(i) { return '<span class="color color-' + i + '"></span>'; }).join('')
                  +'</div>'
                  +'<textarea></textarea><div class="authors"></div></div>')
      .attr('id', data._id)
      .css('left', data.x)
      .css('top', data.y);
    $('textarea',$card).val(data.text);
    $card.removeClassMatching(/color-\d+/g);
    $card.addClass('color-' + (data.colorIndex || 2));
    $('.board').append($card);
    if ( data.authors )
      $( data.authors ).each(function(i,author) { addAuthor( data._id, author ); });
    if ( data.groupId )
      $card.attr('data-group-id', data.groupId);
    adjustTextarea( $('textarea',$card)[0] );
    if ( focusNextCreate ) {
      $('textarea', $card).focus();
      focusNextCreate = false;
    }
    boardroom.moveToTop($card);
  }

  function onColor( data ) {
    var $card = $('#'+data._id);
    $card.removeClassMatching(/color-\d+/g);
    $card.addClass('color-' + data.colorIndex);
  }

  function onText( data ) {
    var $ta = $('#'+data._id+' textarea');
    $ta.val(data.text).attr('disabled','disabled');
    if ( ! cardLocks[data._id] || cardLocks[data._id].user_id != data.author )
      notice( data._id, data.author, data.author + ' is typing...' );
    $('#'+data._id+' .notice').show();
    cardLocks[data._id] = { user_id:data.author, updated:new Date().getTime() };
    addAuthor( data._id, data.author );
    adjustTextarea($ta[0]);
    boardroom.moveToTop('#'+data._id);
  }

  $('.card').live('mousedown', function(e) {
    if ($(e.target).is('textarea:focus')) {
      return true;
    }
    var deltaX = e.clientX-this.offsetLeft, deltaY = e.clientY-this.offsetTop;
    var dragged = this.id, hasMoved = false;
    $card = $(this);

    function location() {
      var card = $('#'+dragged)[0];
      return {_id:dragged, x:card.offsetLeft, y:card.offsetTop, board_name:board.name, author:board.user_id, moved_by:board.user_id};
    }

    var onMousePause = $('.card').onMousePause(function(e) {
      var $this = $(e.target).closest('.card');
      var sorted = $('.card').not($this).toArray().sort(function (first,second) {
        return $(second).css('z-index') - $(first).css('z-index');
      });
      sorted.some(function(other) {
        var $other = $(other);
        if ($other.containsPoint(e.pageX, e.pageY)) {
          $this.addClass('group-intent-source');
          $other.addClass('group-intent-target');
          $this.add($other).addClass('group-intent');

          $this.off('.group');
          $this.on('mouseup.group', function() {
            $this.add($other).removeClassMatching(/group-intent.*/g);
            $this.off('.group');
            boardroom.group.addTo($this, $other);
          });
          $this.on('mousemove.group', function(e) {
            if (!$other.containsPoint(e.pageX, e.pageY)) {
              $this.add($other).removeClassMatching(/group-intent.*/g);
              $this.off('.group');
            }
          });
          return true; // break out of loop
        }
      });
    }, 400);

    function mousemove(e) {
      hasMoved = true;
      $('#'+dragged).css('top', e.clientY - deltaY);
      $('#'+dragged).css('left', e.clientX - deltaX);
      socket.emit('move', location() );
    }

    function mouseup(e) {
      onMousePause.off();
      $(window).unbind('mousemove', mousemove);
      $(window).unbind('mouseup', mouseup);
      socket.emit('move_commit', location() );
    }

    $(window).mousemove(mousemove);
    $(window).mouseup(mouseup);
    boardroom.moveToTop(this);
  });

  $('.card .colors .color').live('click', function() {
    var card = $(this).closest('.card')[0];
    var colorIndex = $(this).attr('class').match(/color-(\d+)/)[1];
    var data = { _id:card.id, colorIndex: colorIndex};
    socket.emit('color', data);
    onColor(data);
  });

  $('.card textarea').live('keyup', function() {
    var card = $(this).closest('.card')[0];
    socket.emit('text', { _id:card.id, text:$(this).val(), author:board.user_id });
    addAuthor( card.id, board.user_id );
    adjustTextarea(this);
    return false;
  });

  $('.card textarea').live('change', function() {
    var card = $(this).closest('.card')[0];
    socket.emit('text_commit', { _id:card.id, text:$(this).val(), board_name:board.name, author:board.user_id });
    if (groupId = $(card).data('group-id')) {
      boardroom.group.layOut(groupId);
    }
  });

  $('.card .delete').live('click', function() {
    var card = $(this).closest('.card')[0];
    socket.emit('delete', { _id:card.id, author:board.user_id });
    $(card).remove();
    return false;
  });

  $('button.create').click(function() {
    createCard();
  });

  function titleChanged() {
    socket.emit('title_changed', { title: $('#title').val() });
  }

  $('#title').keyup(function(e) {
    if (e.keyCode == 13) {
      $(this).blur();
    } else {
      titleChanged();
    }
  });

  $('#title').blur(titleChanged);
}
