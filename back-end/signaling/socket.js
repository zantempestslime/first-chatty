// backend/socket.js
const { WebSocketServer } = require('ws');

function initWebSocket(server) {
  const wss = new WebSocketServer({ server });
  const rooms = new Map();

  wss.on('connection', (ws) => {
    let currentRoom = null;

    ws.on('message', (message) => {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'join':
          currentRoom = data.room;
          if (!rooms.has(currentRoom)) rooms.set(currentRoom, new Set());
          rooms.get(currentRoom).add(ws);
          break;

        case 'offer':
        case 'answer':
        case 'candidate':
      
          if (rooms.has(currentRoom)) {
            rooms.get(currentRoom).forEach((client) => {
              if (client !== ws && client.readyState === ws.OPEN) {
                client.send(JSON.stringify(data));
              }
            });
          }
          break;
      }
    });

    ws.on('close', () => {
      if (currentRoom && rooms.has(currentRoom)) {
        rooms.get(currentRoom).delete(ws);
      }
    });
  });
}

module.exports = initWebSocket;
