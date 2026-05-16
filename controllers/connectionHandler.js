module.exports = (io, getTables, updateTables, getUserTracker, emitActiveRooms)=>{
  const getInitialRoomState = function(roomId) {
    return {
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
      currentRound: 0,
      completedGame: 0,
      currentSetColor: '',
      setColorBroken: false,
      biddingActivePlayer: 'one',
      biddingHighestBid: null,
      biddingPasses: 0,
      biddingDisplay: {
        one: '',
        two: '',
        three: '',
        four: ''
      },
      biddingHistory: [],
      contractDoubled: false,
      whoSetColor: '',
      whoShowCards: '',
      currentCall: 0,
      whoPlayNext: '',
      usersOnTable: 0,
      currentPoints: {
        team1: 0,
        team2: 0,
        setsTakenByTeam1: 0,
        setsTakenByTeam2: 0,
        activeGamesByTeam1: 0,
        activeGamesByTeam2: 0
      },
      honorsPointsForHand: {
        team1: 0,
        team2: 0
      },
      cardHistory: []
    };
  };

  const resetCurrentHandState = function(roomTable) {
    roomTable.cards = {
      one: [],
      two: [],
      three: [],
      four: []
    };
    roomTable.cardsOnTable = [];
    roomTable.cardShown = false;
    roomTable.currentRound = 0;
    roomTable.currentSetColor = '';
    roomTable.setColorBroken = false;
    roomTable.biddingActivePlayer = 'one';
    roomTable.biddingHighestBid = null;
    roomTable.biddingPasses = 0;
    roomTable.biddingDisplay = {
      one: '',
      two: '',
      three: '',
      four: ''
    };
    roomTable.biddingHistory = [];
    roomTable.contractDoubled = false;
    roomTable.whoSetColor = '';
    roomTable.whoShowCards = '';
    roomTable.currentCall = 0;
    roomTable.whoPlayNext = '';
    roomTable.cardHistory = [];
    roomTable.honorsPointsForHand = {
      team1: 0,
      team2: 0
    };
    roomTable.currentPoints.setsTakenByTeam1 = 0;
    roomTable.currentPoints.setsTakenByTeam2 = 0;
  };

  const removeUserFromRoom = function(socket, options = { countDisconnectedUser: false }) {
    const roomId = socket.data.roomId;
    if (!roomId) {
      if (options.countDisconnectedUser) {
        io.emit("user_disconnected", getUserTracker(socket.id));
      }
      return;
    }

    let tables = getTables();

    let userTable = tables.find(table=>table.roomId===roomId);
    if (userTable) {
      const serial = socket.data.serial;
      const userName = socket.data.user;

      userTable.usersOnTable--;
      userTable.players[serial] = 'player ' + serial;

      if(userTable.usersOnTable===0){ // no user left in room
        tables = tables.filter(table=>table.roomId!=roomId);
      } else {
        resetCurrentHandState(userTable);
        io.to(roomId).emit("can_shuffle", false);
        io.to(roomId).emit("bidding_state", null);
        io.to(roomId).emit("standing_call", 'No bid yet');
        io.to(roomId).emit("update_points", userTable.currentPoints);
        socket.to(roomId).emit("user_left_room", userName, userTable.players);
      }
    }

    socket.leave(roomId);
    socket.data.roomId = undefined;
    socket.data.serial = undefined;
    socket.data.user = undefined;

    updateTables(tables);
    const userTracker = getUserTracker(options.countDisconnectedUser ? socket.id : undefined);
    io.emit(options.countDisconnectedUser ? "user_disconnected" : "user_inactive", userTracker);
    emitActiveRooms();
  }

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
      let serial = 'one';

      // table for the room
      userTable = getInitialRoomState(roomId);
      userTable.usersOnTable = 1;
      
  
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

      // notify active user numbers to everyone after the socket is marked active
      io.emit("user_active", getUserTracker());

      if(userTable.usersOnTable === 4){
        io.to(roomId).emit("can_shuffle", true);
      }

      // propagate updated table information to central data set table
      updateTables(tables);
      emitActiveRooms();
      
    } else { // there is no spot in table
      console.log('user cant join in the room');
      socket.emit('capacity_full');
    }
  };

  const disconnectHandler = async function (reason){
    const socket = this;
    removeUserFromRoom(socket, { countDisconnectedUser: true });
  };

  const leaveRoomController = function (){
    const socket = this;
    removeUserFromRoom(socket, { countDisconnectedUser: false });
  };

  return { joinRoomController, leaveRoomController, disconnectHandler }
}
