const send_btn = document.getElementById('send-btn');
const text_input = document.getElementById('text-input');
const text_area = document.getElementById('text-area');

// 1. Establish background network connections to your live Render server
const socket = io('https://first-chatty.onrender.com', {
  transports: ['websocket']
});

let peerConnection;
let dataChannel;
const configuration = { iceServers: [{ urls: 'stun:://google.com' }] };

// Automatically join a universal room named "casual-chat" on page load
socket.on('connect', () => {
  socket.emit('join', 'casual-chat');
});

// Helper function to append message tags directly to your text area layout
function appendMessageToUI(text, senderType) {
  const new_message = document.createElement('p');
  new_message.textContent = text;
  new_message.classList.add('message', senderType);
  text_area.appendChild(new_message);
  text_area.scrollTop = text_area.scrollHeight;
}

function setupWebRTC(isInitiator) {
  peerConnection = new RTCPeerConnection(configuration);

  // Swap network pathways via your Socket.io server
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { type: 'candidate', candidate: event.candidate });
    }
  };

  if (isInitiator) {
    // Setup direct serverless pathway
    dataChannel = peerConnection.createDataChannel('chatChannel');
    setupDataChannelEvents();
    
    peerConnection.createOffer()
      .then(offer => peerConnection.setLocalDescription(offer))
      .then(() => {
        socket.emit('signal', { type: 'offer', offer: peerConnection.localDescription });
      });
  } else {
    // Wait for incoming direct serverless pathway
    peerConnection.ondatachannel = (event) => {
      dataChannel = event.channel;
      setupDataChannelEvents();
    };
  }
}

// Socket.io Signaling Network Message Router
socket.on('signal', async (data) => {
  if (data.type === 'offer') {
    setupWebRTC(false);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('signal', { type: 'answer', answer: peerConnection.localDescription });
  } else if (data.type === 'answer') {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  } else if (data.type === 'candidate') {
    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
});

function setupDataChannelEvents() {
  dataChannel.onopen = () => {
    appendMessageToUI("--- Direct WebRTC Connection Established ---", "system");
  };
  dataChannel.onmessage = (event) => {
    appendMessageToUI(event.data, "peer");
  };
}

// 2. Modified Send Button Listener
send_btn.addEventListener('click', () => {
  const textValue = text_input.value.trim();
  if (textValue === '') return;

  // Send across the WebRTC P2P direct network data pipeline
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(textValue);
    appendMessageToUI(textValue, "you");
    text_input.value = '';
  } else {
    console.log("Waiting for another tab to join the room...");
    setupWebRTC(true);
  }
});
