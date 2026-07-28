const express = require('express'); 
const app = express(); 
const http = require('http').createServer(app); 
const io = require('socket.io')(http, {
  cors: {
    origin: "*", // Allows your frontend application to connect safely
    methods: ["GET", "POST"]
  }
}); 

// Basic WebRTC connection signaling handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Forwarding signaling data (offers, answers, ice candidates) to everyone else
  socket.on('signal', (data) => {
    socket.broadcast.emit('signal', data);
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
