var fs = require('fs');
const express = require('express');
var options = {
  key: fs.readFileSync(__dirname +'/../helpers/secrets/certs/cert.key'),
  cert: fs.readFileSync(__dirname +'/../helpers/secrets/certs/cert.crt')
};
const app = express();


tables = []; // this is the tracking data of all created rooms/tables

const updateTables = function(inputTables){
  tables=inputTables;
};

const getTables = function(){
  return structuredClone(tables);
}

userTracker = { // this is the tracking data of all connected users and active users(joined in room/table)
  connectedUsers : 0,
  activeUsers : 0
};

const getUserTracker = function(){
  return structuredClone(userTracker);
}

const updateUserTracker = function(updatedUserTracker){
  userTracker = updatedUserTracker;
}

app.get('/tables', (req, res) => { // endpoint to be used to track data during development period

  // Send the tables as a response to the client
  res.send(getTables());
});

// var options = {
//   key: fs.readFileSync('/home/ec2-user/secrets/certs/cert.key'),
//   cert: fs.readFileSync('/home/ec2-user/secrets/certs/cert.crt')
// };
const server = require('https').createServer(options, app);
const io = require('socket.io')(server,{
  cors: {
    origin: '*',
    methods: ["GET", "POST"]
  }
});

const { joinRoomController, disconnectHandler } = require("./connectionHandler")(io, getTables, updateTables, getUserTracker, updateUserTracker);
const { shuffleCard, playCardHandler, unplayCardHandler, onCallDecided, onRoundComplete, onGameCompleted } = require('./cardPlayHandler')(io, getTables, updateTables);

const onConnection = (socket) => {

  // keep track of users connected
  let userTracker = getUserTracker();
  userTracker.connectedUsers++;
  updateUserTracker(userTracker);

  // notify connected user numbers to everyone after new user connects
  io.emit("user_connected", userTracker);

  // joining to a room
  socket.on('join', joinRoomController);

  // shuffle 52 cards and distribute to players
  socket.on('shuffleCard', shuffleCard);

  // play a particular card
  socket.on('playCard', playCardHandler);

  // unplay a particular card
  socket.on('unplayCard', unplayCardHandler);

  // notify connected user numbers to everyone after a user disconnects
  socket.on('disconnect', disconnectHandler);

  // take actions after a call is decided by the users
  socket.on('callDecided', onCallDecided);

  // perform actions after a round is complete
  socket.on('roundComplete', onRoundComplete);

  // update points and clear table after a game is completed
  socket.on('completeGame', onGameCompleted);
};

io.on("connection", onConnection);

module.exports = { server };