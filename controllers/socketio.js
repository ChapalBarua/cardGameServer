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
const { joinRoomController } = require("./connectionHandler")(io,tables);
const { shuffleCard } = require('./cardPlayHandler')(io,tables);
const onConnection = (socketConnection) => {
  console.log(`User connected`);
  socketio = io;
  socket = socketConnection;

  // joining to a room
  socket.on('join', joinRoomController);

  // shuffle 52 cards and distribute to players
  socket.on('shuffleCard', shuffleCard);
};

io.on("connection", onConnection);

module.exports = { server };