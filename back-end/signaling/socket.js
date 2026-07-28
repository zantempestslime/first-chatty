const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: "*", // Allows your frontend application to connect safely
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Actually join the requested room
  socket.on('join', (roomName) => {
    socket.join(roomName);
    socket.data.room = roomName;
    console.log(`${socket.id} joined room: ${roomName}`);
  });

  // Forward signaling data only to others in the same room
  socket.on('signal', (data) => {
    const room = socket.data.room;
    if (room) {
      socket.to(room).emit('signal', data);
    } else {
      // Fallback: no room joined, broadcast globally (old behavior)
      socket.broadcast.emit('signal', data);
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Bind dynamically to Render's allocated environment port
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});