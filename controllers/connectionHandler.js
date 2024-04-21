module.exports = (io)=>{
  const joinRoomController = async function (payload){
    const socket = this;
    const roomId = payload.room;
    const userName = payload.userName;
    const roomClients = io.sockets.adapter.rooms.get(roomId) || new Set();
    const numberOfClients = roomClients.size;
    console.log(`Room ID: ${roomId}`);
    console.log(`numberOfClients of room ${roomId}: ${numberOfClients}`);
  
    // These events are emitted only to the sender socket.
    
    let userTable;
    if(numberOfClients <= 3){ // there is spot available in the table
  
      socket.data.user = userName;
      socket.data.roomId = roomId;
  
      // creating and joining an empty room
      if(numberOfClients === 0){
        console.log(`Creating room ${roomId} and emitting room_created socket event`);
  
        // creating new table for the new room in tables data
        userTable = {
          roomId: roomId,
          cards: {
            bottom: [],
            left: [],
            top: [],
            right: []
          },
          players: {
            bottom: '',
            left: '',
            top: '',
            right: ''
          },
          currentRound: 0, // running round out of 13 card set (4*13)
          completedGame: 0, // how many games are completed
          currentSetColor: '',
          whoSetColor: '' //('top', 'bottom', 'left', 'right')
        };
  
        // finding empty seat and placing newly joined player there
   
        let orientation = Object.keys(userTable.players).filter(key=>userTable.players[key]==='')[0];
        socket.data.orientation = orientation;
        userTable.players[orientation] = userName;
  
        tables.push(userTable); // updating tables in calling function - socketio.js
        await socket.join(roomId);
  
        socket.emit('room_created', {
          roomId,
          peerId: socket.id,
          user: userName,
          orientation,
          players: userTable.players
        });
      } 
      
      // joining an existing room
      else { 
        console.log(`Joining room ${roomId} and emitting room_joined socket event`);
        
        userTable = tables.find(table=>table.roomId===roomId);
        let orientation = Object.keys(userTable.players).find(key=>userTable.players[key]==='');
        socket.data.orientation = orientation;
        userTable.players[orientation] = userName;
  
        await socket.join(roomId);
        socket.emit('room_joined', {
          roomId: roomId,
          peerId: socket.id,
          user: socket.data.user,
          orientation: socket.data.orientation,
          players: userTable.players
        });
      }
    } else { // there is no spot in table
      socket.emit('capacity_full');
    }
  };

  return { joinRoomController }
}