var fs = require('fs');
const express = require('express');
var options = {
  key: fs.readFileSync(__dirname +'/../helpers/secrets/certs/cert.key'),
  cert: fs.readFileSync(__dirname +'/../helpers/secrets/certs/cert.crt')
};
const app = express();
const joinRoomController = require("./connectionController").joinRoom;
const setUser = require("./connectionController").setUser;
data = [];

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
  tables = data; // this is the tracking data of all created rooms/tables

  // joining to a room
  socket.on('join', joinRoomController);

  // assign user name to the connection
  socket.on('setUser', setUser);

  socket.on('shuffleCard', (payload) => {
    // console.log(tables)
    // console.log('card is shuffled');
    // console.log(socket.data.orientation);
  });
})

module.exports = { server };