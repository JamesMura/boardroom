var express = require( 'express' ),
    sockets = require( 'socket.io' ),
    board = require('./lib/board.js'),
    sessions = require('cookie-sessions');

var app = express.createServer();

var io = sockets.listen(app);
io.set('log level', 1);

process.on( "uncaughtException", function( error ) {
  console.error( "Uncaught exception: " + error.message );
  if (error.stack) {
    console.log('\nStacktrace:');
    console.log('====================');
    console.log(error.stack);
  }
});

app.configure( function() {
  app.set( "views", __dirname + "/views/" );
  app.set( "view engine", "jade" );
  app.use( express.compiler( { src : __dirname + '/public', enable : [ 'less' ] } ) );
  app.use( express.bodyParser() );
  app.use(express.static(__dirname + '/public'));
  app.use(sessions( {secret: 'a7c6dddb4fa9cf927fc3d9a2c052d889', session_key: 'carbonite'}) );
  app.error( function( error, request, response ) {
    console.error( error.message );
    if ( error.stack ) console.error( error.stack.join( "\n" ) );
    response.render( "500", { status : 500, error : error } );
  });
});

var boardNamespaces = {};

function userInfo(request) {
  if ( request.session && request.session.user_id )
    return { user_id:request.session.user_id };

  return undefined;
}

app.get( "/boards/:board", requireAuth, function(request, response) { 
  if (!boardNamespaces[request.params.board])
    createBoardSession( request.params.board );
  response.render("board", {
    user: userInfo(request)
  });
});

app.get( "/boards/:board/info", function(request, response) {
  var boardName = request.params.board;
  board.findCards( { boardName:boardName, deleted:{$ne:true} }, board.arrayReducer(function(cards) {
    response.send({
      name:boardName,
      cards:cards,
      users:boardNamespaces[boardName] || {},
      user_id:request.session.user_id,
      title: boardName
    });
  }));
});

function requireAuth( request, response, next ) {
  if ( !request.session ) {
    request.session = {};
  }
  if ( request.session.user_id ) {
    return next();
  }
  request.session.post_auth_url = request.url;
  response.redirect("/login");
}

app.get( "/login", function(request, response) {
  response.render("login");
});

app.post( "/login", function(request, response) {
  if ( !request.session ) {
    request.session = {};
  }
  request.session.user_id = request.body.user_id;
  response.redirect(request.session.post_auth_url || '/');
  delete request.session.post_auth_url;
});

app.get( "/logout", function(request, response) {
  request.session = {};
  response.redirect("/")
});

app.get( "/", requireAuth, function(request, response) {
    response.redirect("/boards")
});

app.get( "/boards", requireAuth, function(request, response) {
  board.findBoards( {deleted:{$ne:true}}, board.arrayReducer( function(boards) {
    board.findBoardCardCounts( function(boardCounts) {
      var boardCountsByName = boardCounts.reduce( function(o,item) { o[item.boardName]=item.count;return o},{} );
      response.render("boards", {
        user: userInfo(request),
        boards: boards,
        boardCounts: boardCountsByName
      });
    });
  }) );
});

app.get( "/user/avatar/:user_id", function(request, response) {
  var url, m, md5;
  if ( m = /^@(.*)/.exec(request.params.user_id) ) {
    url = "http://api.twitter.com/1/users/profile_image?size=normal&screen_name=" + encodeURIComponent(m[1]);
  } else {
    md5 = require('crypto').createHash('md5');
    md5.update(request.params.user_id);
    url = "http://www.gravatar.com/avatar/" + md5.digest('hex') + "?d=retro";
  }
  response.redirect( url );
});

app.listen( parseInt(process.env.PORT) || 7777 ); 

function createBoardSession( boardName ) {
  var boardMembers = {};
  var boardNamespace = io.of("/boardNamespace/" + boardName)
      .on('connection', function( socket ) {
        rebroadcast(socket, ['move', 'text', 'color']);
        socket.on('join', function( user ) {
          boardMembers[user.user_id] = user;
          boardNamespace.emit( 'joined', user );
          board.findOrCreateBoard( boardName, user.user_id, function(b) { socket.emit('title_changed', b.title); });
        });
        socket.on('add', function(data) {
          addCard(boardNamespace,data);
          board.findBoard(boardName, function(b) {
            boards_channel.emit('card_added', b, data.author);
          });
        });
        socket.on('delete', function(data) {
          deleteCard(boardNamespace,data);
          board.findBoard(boardName, function(b) {
            boards_channel.emit('card_deleted', b, data.author);
          });
        });
        socket.on('move_commit', updateCard );
        socket.on('text_commit', updateCard );
        socket.on('color', updateCard );

        socket.on('title_changed', function(data) {
          board.updateBoard(boardName, { title: data.title });
          socket.broadcast.emit('title_changed', data.title);
          board.findBoard(boardName, function(b) {
            boards_channel.emit('board_changed', b);
          });
        });
    });
  boardNamespaces[boardName] = boardMembers;
}

// Boards index socket handler
var boards_channel = io.of("/channel/boards")
  .on('connection', function( socket ) {
    //console.log("Connected to /channel/boards");
    rebroadcast(socket, ['delete']);
    socket.on('delete', function( delete_board ) {
      board.deleteBoard(delete_board.board_id);
    });
  });

function rebroadcast( socket, events ) {
  events.forEach(function(event) {
    socket.on(event, function(data) { socket.broadcast.emit( event, data ); });
  });
}

function deleteCard( boardNamespace, card ) {
  board.removeCard( { _id:card._id }, function() {
    boardNamespace.emit('delete', card);
  });
}

function addCard( boardNamespace, card ) {
  board.saveCard( card, function( saved ) {
    boardNamespace.emit('add', saved);
  });
}

function updateCard( card ) {
  board.updateCard(card);
  board.findBoard(card.board_name, function(b) {
    boards_channel.emit('user_activity', b, card.author, 'Did something');
  });
}
