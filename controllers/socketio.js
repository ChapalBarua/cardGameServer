var fs = require('fs');
const express = require('express');
var options = {
  key: fs.readFileSync(__dirname +'/../helpers/secrets/certs/cert.key'),
  cert: fs.readFileSync(__dirname +'/../helpers/secrets/certs/cert.crt')
};
const app = express();

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

tables = []; // this is the tracking data of all created rooms/tables

let userTracker = { // this is the tracking data of all connected users and active users(joined in room/table)
  connectedUsers : 0,
  activeUsers : 0
}
const { joinRoomController, disconnectHandler } = require("./connectionHandler")(io,tables,userTracker);
const { shuffleCard } = require('./cardPlayHandler')(io,tables);
const onConnection = (socket) => {

  // keep track of users connected
  userTracker.connectedUsers++;

  // notify connected user numbers to everyone after new user connects
  io.emit("user_connected", userTracker);


  // joining to a room
  socket.on('join', joinRoomController);

  // shuffle 52 cards and distribute to players
  socket.on('shuffleCard', shuffleCard);

  // notify connected user numbers to everyone after a user disconnects
  socket.on('disconnect', disconnectHandler);

};

io.on("connection", onConnection);

module.exports = { server };