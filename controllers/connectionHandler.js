module.exports = (io, getTables, updateTables, getUserTracker, updateUserTracker)=>{

  // should not use await here. when multiple user connects disconnects at the same time - await creates issues - like skipping to second
  // user before first user is finished
  const joinRoomController = async function (payload){
    const socket = this;
    const roomId = payload.room;
    const userName = payload.userName;
    const roomClients = io.sockets.adapter.rooms.get(roomId) || new Set();
    const numberOfClients = roomClients.size;
    if(numberOfClients <= 3){ // there is spot available in the table

      // joining room
      socket.join(roomId);

      let userTable;
      let tables = getTables();
      let userTracker = getUserTracker();
      let serial = 'one';

      // notify active user numbers to everyone after new user connects
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
        cardsOnTable: [],
        cardShown: false,
        currentRound: 0, // running round out of 13 card set (4*13)
        completedGame: 0, // how many games are completed
        currentSetColor: '',
        whoSetColor: '', //('one', 'two', 'three', 'four'),
        whoShowCards: '', //('one', 'two', 'three', 'four'),
        currentCall: 0, // 1,2,3,4,5,6,7
        whoPlayNext: '', // one, two, three, four
        usersOnTable: 1,
        currentPoints: { // team 1 -one,three, team two - two four serial
          team1: 0,
          team2: 0,
          setsTakenByTeam1: 0,
          setsTakenByTeam2: 0,
          activeGamesByTeam1: 0,
          activeGamesByTeam2: 0
        },
        cardHistory: []
      };
      
  
      // creating and joining an empty room
      if(numberOfClients === 0){
        // update tables when user joins
        tables = tables.filter(table=>table.roomId!=roomId); // drops table in case there is any residue data
        userTable.players[serial] = userName;
        tables.push(userTable);

        socket.emit('room_created', {
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
        // update tables when user joins
        userTable.players[serial] = userName;
        userTable.usersOnTable++;

        // inform owner that he has joined the room
        socket.emit('room_joined', {
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

      if(userTable.usersOnTable === 4){
        io.to(roomId).emit("can_shuffle", true);
      }

      // propagate updated table information to central data set table
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
    io.emit("user_disconnected", userTracker);
    
    if(roomId){
      
      // Global-actions-  informs everyone that a user has disconnected from any room
      userTracker.activeUsers--;
      io.emit("user_inactive", userTracker);

      userTable = tables.find(table=>table.roomId===roomId);
      userTable.usersOnTable--;
      if(userTable.usersOnTable===0){ // no user left in room
        tables = tables.filter(table=>table.roomId!=roomId);
        updateTables(tables); // updating tables before returning
        updateUserTracker(userTracker);
        return;
      }

      // local (room) actions
      io.to(roomId).emit("can_shuffle", false);
      
      let serial = socket.data.serial;
      let userName = socket.data.user;
      
      userTable.players[serial] = 'player ' + serial;

      // informs everyone in the same room that a user has disconnected from that room
      socket.to(roomId).emit("user_left_room", userName, userTable.players);
    }
    updateTables(tables);
    updateUserTracker(userTracker);
  };

  return { joinRoomController, disconnectHandler }
}