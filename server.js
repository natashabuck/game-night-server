//server
const cors = require( 'cors' )
const shortid = require( 'shortid' )
const app = require( 'express' )();
//websockets
const server = require( 'http' ).createServer( app );
const originList = [ 'http://localhost:3000', 'https://www.game-night.app' ]
const io = require( 'socket.io' )( server, { origins: originList } );
const PORT = process.env.PORT || 5000;

let rooms = {};
let chatLogs = {};

//creating a room
app.get( '/newRoom', cors( { origin: originList } ), ( req, res ) => {
  // id is what other players will be typing in to enter the room so it needs to be easy
  // 0 - O and I - l are difficult to distinguish in the app font
  const id = shortid.generate().slice( 0, 7 ).replace( /0|O|I|l/gi, 'A' )

  const room = { id, players: [], game: null }
  rooms[ id ] = room;
  chatLogs[ id ] = [];
  res.json( { room, chats: [] } );
} );

//check to see if room exists before uploading player data
app.get( '/checkRoom/:roomId', cors( { origin: originList } ), ( req, res ) => {
  const roomId = req.params.roomId;
  if ( rooms[ roomId ] ) {
    res.json( { room: rooms[ roomId ], chats: chatLogs[ roomId ] } );
  } else {
    res.json( { error: 'The room you requested does not exist.' } )
  }
} );

//joining a room
app.get( '/room/:roomId/:username/:avatar', cors( { origin: originList } ), ( req, res ) => {
  const player = { username: req.params.username, avatar: req.params.avatar, score: 0 }
  const newPlayerMsg = { ...player, message: 'has entered the chat' }
  const roomId = req.params.roomId;

  rooms[ roomId ] = { ...rooms[ roomId ], players: [ ...rooms[ roomId ].players, player ] }
  chatLogs[ roomId ] = [ ...chatLogs[ roomId ], newPlayerMsg ]
  res.json( { room: rooms[ roomId ], chats: chatLogs[ roomId ] } );
} );

//websockets that will alert the whole group of events immediately
io.on( 'connection', ( socket ) => {
  socket.on( 'event://send-message', ( msg ) => {
    const payload = JSON.parse( msg );
    if ( chatLogs[ payload.room.id ] ) {
      chatLogs[ payload.room.id ] = [ ...chatLogs[ payload.room.id ], payload.data ];
    }
    const response = JSON.stringify( {
      room: rooms[ payload.room.id ],
      chats: chatLogs[ payload.room.id ]
    } )
    socket.broadcast.emit( 'event://get-message', response );
  } )
} );

io.on( 'connection', ( socket ) => {
  let player, roomId;
  socket.on( 'event://add-player', ( msg ) => {
    const payload = JSON.parse( msg );

    if ( payload.data && payload.room ) {
      player = payload.data
      roomId = payload.room.id
    }

    const response = JSON.stringify( {
      room: rooms[ payload.room.id ],
      chats: chatLogs[ payload.room.id ]
    } )
    socket.broadcast.emit( 'event://get-player', response );
  } )
  socket.on( 'disconnect', function () {
    if ( player ) { //this was causing errors in dev hot reloading
      const { username, avatar } = player

      let newPlayerList = [ ...rooms[ roomId ].players ]
      newPlayerList = newPlayerList.filter( item => item.username !== username )
      rooms[ roomId ].players = newPlayerList

      const playerExitMsg = { username, avatar, message: 'has left the chat' }
      chatLogs[ roomId ] = [ ...chatLogs[ roomId ], playerExitMsg ]

      const response = JSON.stringify( {
        room: rooms[ roomId ],
        chats: chatLogs[ roomId ]
      } )
      socket.broadcast.emit( 'event://get-player', response );
    }
  } )
} );

io.on( 'connection', ( socket ) => {
  socket.on( 'event://update-score', ( msg ) => {
    const payload = JSON.parse( msg );
    rooms[ payload.roomId ].players[ payload.playerIdx ].score = payload.score
    const response = JSON.stringify( payload )
    socket.broadcast.emit( 'event://get-score', response );
  } )
} );

io.on( 'connection', ( socket ) => {
  socket.on( 'event://update-game', ( msg ) => {
    const payload = JSON.parse( msg );
    rooms[ payload.roomId ].game = payload.game
    const response = JSON.stringify( payload )
    socket.broadcast.emit( 'event://get-game', response );
  } )
} );

server.listen( PORT );