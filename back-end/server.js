const https = require('https');
const fs = require('fs');
const initWebSocket = require('./signaling/socket.js'); 

// Load your local security certificates
const options = {
  key: fs.readFileSync('cert.key'),
  cert: fs.readFileSync('cert.crt')
};

// Create a secure HTTPS base server
const server = https.createServer(options, (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Secure Signaling server is active\n');
});

initWebSocket(server);

server.listen(3000, () => {
  console.log(`Signaling server running securely on port 3000`);
});
