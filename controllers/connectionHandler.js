module.exports = (io, getTables, updateTables, getUserTracker, updateUserTracker)=>{
  const joinRoomController = async function (payload){
    const socket = this;
    const roomId = payload.room;
    const userName = payload.userName;
    const roomClients = io.sockets.adapter.rooms.get(roomId) || new Set();
    const numberOfClients = roomClients.size;
    
    let userTable;
    if(numberOfClients <= 3){ // there is spot available in the table

      // joining room
      await socket.join(roomId);

      // notify active user numbers to everyone after new user connects
      let userTracker = getUserTracker();
      userTracker.activeUsers++;
      updateUserTracker(userTracker);

      io.emit("user_active", userTracker);

      // table for the room
      userTable = {
        roomId: roomId,
        cards: {
          one: [],
          two: [],
          three: [],
          four: []
        },
        players: {
          one: 'player one',
          two: 'player two',
          three: 'player three',
          four: 'player four'
        },
        currentRound: 0, // running round out of 13 card set (4*13)
        completedGame: 0, // how many games are completed
        currentSetColor: '',
        whoSetColor: '' //('one', 'two', 'three', 'four')
      };
      serial = 'one';
  
      // creating and joining an empty room
      let tables = getTables();
      if(numberOfClients === 0){
        tables.push(userTable);
        await socket.emit('room_created', {
          roomId,
          peerId: socket.id,
          user: userName,
          serial,
          players: userTable.players
        });
      }else { // joining an existing room
        userTable = tables.find(table=>table.roomId===roomId); // update user table if room already exist

        // finding empty serial one/two/three/four
        serial = Object.keys(userTable.players).filter(key=>userTable.players[key]==='player ' + key)[0];

        await socket.emit('room_joined', {
          roomId,
          peerId: socket.id,
          user: userName,
          serial,
          players: userTable.players
        });

        // informs everyone else in the room that an user joined room
        socket.to(roomId).emit("user_joined_room", userName, userTable.players);
      }

      socket.data.user = userName;
      socket.data.roomId = roomId;
      socket.data.serial = serial;
      userTable.players[serial] = userName;
      updateTables(tables);
      
    } else { // there is no spot in table
      console.log('user cant join in the room');
      socket.emit('capacity_full');
    }
  };

  const disconnectHandler = async function (reason){
    socket = this;
    roomId = socket.data.roomId;
    // informs everyone that any user has disconnected from the server
    let tables = getTables();
    let userTracker = getUserTracker();
    userTracker.connectedUsers--;
    await io.emit("user_disconnected", userTracker);
    
    if(roomId){
      // informs everyone that a user has disconnected from any room
      userTracker.activeUsers--;
      await io.emit("user_inactive", userTracker);

      // informs everyone in the same room that a user has disconnected from that room
      let serial = socket.data.serial;
      let userName = socket.data.user;
      userTable = tables.find(table=>table.roomId===roomId);
      userTable.players[serial] = 'player ' + serial;

      // if room id does not exist (room became empty) drop table
      if( !io.sockets.adapter.rooms.get(roomId)){
        tables = tables.filter(table=>table.roomId!=roomId);
      }
      await socket.to(roomId).emit("user_left_room", userName, userTable.players);
    }
    updateTables(tables);
    updateUserTracker(userTracker);
  };

  return { joinRoomController, disconnectHandler }
}