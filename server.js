var fs = require('fs');
const express = require('express');
var options = {
  key: fs.readFileSync('helpers/secrets/certs/cert.key'),
  cert: fs.readFileSync('helpers/secrets/certs/cert.crt')
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

let tables = [];

io.on("connection", (socket) => {
  console.log(`User connected`);

  socket.on('join', (payload) => {
    const roomId = payload.room
    const roomClients = io.sockets.adapter.rooms[roomId] || { length: 0 }
    const numberOfClients = roomClients.length
    console.log(`Room ID: ${roomId}`)
    console.log(`roomClients: ${roomClients}`)
    console.log(`numberOfClients of ${roomId}: ${numberOfClients}`)

    // These events are emitted only to the sender socket.
    if (numberOfClients == 0) {
      console.log(`Creating room ${roomId} and emitting room_created socket event`)
      socket.join(roomId)
      socket.emit('room_created', {
        roomId: roomId,
        peerId: socket.id,

      })
    } else {
      console.log(`Joining room ${roomId} and emitting room_joined socket event`)
      socket.join(roomId)
      socket.emit('room_joined', {
        roomId: roomId,
        peerId: socket.id
      })
    } 
  });

  socket.on('shuffleCard', (payload) => {
    console.log('card is shuffled');
  })



})

server.listen(3000);