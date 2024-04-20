sittingSequence = ['bottom', 'left', 'top', 'right'];

function joinRoom (payload) {
  const roomId = payload.room;
  const roomClients = socketio.sockets.adapter.rooms.get(roomId) || new Set();
  const numberOfClients = roomClients.size;
  console.log(`Room ID: ${roomId}`);
  console.log(`numberOfClients of room ${roomId}: ${numberOfClients}`);

  // These events are emitted only to the sender socket.
  
  let table;
  if(numberOfClients <= 3){ // there is spot available in the table

    // assigning sitting chair to newly joined player
    socket.data.orientation = sittingSequence[numberOfClients];

    if(numberOfClients === 0){
      console.log(`Creating room ${roomId} and emitting room_created socket event`);

      // creating new table for the new room in tables data
      table = {
        roomId: roomId,
        players: {
          top: [],
          bottom: [],
          left: [],
          right: []
        },
        currentRound: 0, // running round out of 13 card set (4*13)
        completedGame: 0, // how many games are completed
        currentSetColor: '',
        whoSetColor: '' //('top', 'bottom', 'left', 'right')
      };

      tables.push(table); // updating tables in calling function - socketio.js

      socket.join(roomId);
      socket.emit('room_created', {
        roomId: roomId,
        peerId: socket.id,
        user: socket.data.user,
        orientation: socket.data.orientation
      });
    } else { 
      console.log(`Joining room ${roomId} and emitting room_joined socket event`);
      socket.join(roomId);
      socket.emit('room_joined', {
        roomId: roomId,
        peerId: socket.id,
        user: socket.data.user,
        orientation: socket.data.orientation
      });
    }
  } else { // there is no spot in table
    socket.emit('capacity_full');
  }
};

function setUser(userName){
  socket.data.user = userName;

}

module.exports = { joinRoom, setUser };