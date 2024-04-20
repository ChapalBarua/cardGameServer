var fs = require('fs');
const express = require('express');
var options = {
  key: fs.readFileSync(__dirname +'/../helpers/secrets/certs/cert.key'),
  cert: fs.readFileSync(__dirname +'/../helpers/secrets/certs/cert.crt')
};
const app = express();
const joinRoomController = require("./joinRoom").joinRoom;

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

io.on("connection", (socketConnection) => {
  console.log(`User connected`);
  socketio = io;
  socket = socketConnection;
  socket.on('join', joinRoomController);

  socket.on('shuffleCard', (payload) => {
    console.log('card is shuffled');
  })
})

module.exports = { server };