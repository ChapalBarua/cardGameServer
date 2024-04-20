
function joinRoom (payload) {
    const roomId = payload.room;
    const roomClients = socketio.sockets.adapter.rooms.get(roomId) || new Set();
    const numberOfClients = roomClients.size;
    console.log(`Room ID: ${roomId}`);
    console.log(`numberOfClients of room ${roomId}: ${numberOfClients}`);

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
};

module.exports = {joinRoom};