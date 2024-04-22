module.exports = (io,tables,userTracker)=>{
  const joinRoomController = async function (payload){
    const socket = this;
    const roomId = payload.room;
    const userName = payload.userName;
    const roomClients = io.sockets.adapter.rooms.get(roomId) || new Set();
    const numberOfClients = roomClients.size;
  
    // These events are emitted only to the sender socket.
    
    let userTable;
    if(numberOfClients <= 3){ // there is spot available in the table
  
      socket.data.user = userName;
      socket.data.roomId = roomId;
  
      // creating and joining an empty room
      if(numberOfClients === 0){
  
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

        // notify active user numbers to everyone after new user connects
        userTracker.activeUsers++;
        io.emit("user_active", userTracker);

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
        userTable = tables.find(table=>table.roomId===roomId);
        let orientation = Object.keys(userTable.players).find(key=>userTable.players[key]==='');
        socket.data.orientation = orientation;
        userTable.players[orientation] = userName;
  
        await socket.join(roomId);
        await socket.emit('room_joined', {
          roomId: roomId,
          peerId: socket.id,
          user: userName,
          orientation: orientation,
          players: userTable.players
        });

        // notify active user numbers to everyone after new user connects
        userTracker.activeUsers++;
        io.emit("user_active", userTracker);
        
        // informs everyone else in the room that an user joined room
        socket.to(roomId).emit("user_joined_room", userName, userTable.players);
      }
    } else { // there is no spot in table
      console.log('user cant join in the room');
      socket.emit('capacity_full');
    }
  };


  const disconnectHandler = async function (reason){
    socket = this;
    roomId = socket.data.roomId;

    // informs everyone that any user has disconnected from the server
    userTracker.connectedUsers--;
    io.emit("user_disconnected", userTracker);
    

    if(roomId){
      
      // informs everyone that a user has disconnected from any room
      userTracker.activeUsers--;
      io.emit("user_inactive", userTracker);

      // informs everyone in the same room that a user has disconnected from that room
      let orientation = socket.data.orientation;
      let userName = socket.data.user;
      userTable = tables.find(table=>table.roomId===roomId);
      userTable.players[orientation] = '';

      socket.to(roomId).emit("user_left_room", userName, userTable.players);
    }
  };

  return { joinRoomController, disconnectHandler }
}