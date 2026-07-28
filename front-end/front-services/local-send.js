const send_btn = document.getElementById('send-btn');
const text_input = document.getElementById('text-input');
const text_area = document.getElementById('text-area');

const socket = io('https://first-chatty.onrender.com', {
  transports: ['websocket']
});

let peerConnection = null;
let dataChannel = null;
let isInitiator = false;
let pendingCandidates = []; // Important: queue candidates until remote description is set

const configuration = {
  iceServers: [
    { urls: "stun:stun.relay.metered.ca:80" },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "95e33d67d86cedc472faf8ef",
      credential: "8XwF3aZRR1yMQF1j",
    },
    {
      urls: "turn:global.relay.metered.ca:80?transport=tcp",
      username: "95e33d67d86cedc472faf8ef",
      credential: "8XwF3aZRR1yMQF1j",
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: "95e33d67d86cedc472faf8ef",
      credential: "8XwF3aZRR1yMQF1j",
    },
    {
      urls: "turns:global.relay.metered.ca:443?transport=tcp",
      username: "95e33d67d86cedc472faf8ef",
      credential: "8XwF3aZRR1yMQF1j",
    },
  ]
};

// Join the room as soon as connected
socket.on('connect', () => {
  console.log("Connected to signaling server");
  socket.emit('join', 'casual-chat');
});

function appendMessageToUI(text, senderType) {
  const new_message = document.createElement('p');
  new_message.textContent = text;
  new_message.classList.add('message', senderType);
  text_area.appendChild(new_message);
  text_area.scrollTop = text_area.scrollHeight;
}

function setupDataChannelEvents() {
  dataChannel.onopen = () => {
    console.log("Data channel is open!");
    appendMessageToUI("--- Direct WebRTC Connection Established ---", "system");
  };

  dataChannel.onmessage = (event) => {
    appendMessageToUI(event.data, "peer");
  };

  dataChannel.onclose = () => {
    console.log("Data channel closed");
  };

  dataChannel.onerror = (err) => {
    console.error("Data channel error:", err);
  };
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(configuration);

  // Log connection states (very useful for debugging)
  peerConnection.oniceconnectionstatechange = () => {
    console.log("ICE Connection State:", peerConnection.iceConnectionState);
  };

  peerConnection.onconnectionstatechange = () => {
    console.log("Connection State:", peerConnection.connectionState);
  };

  // Send ICE candidates to the other peer
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("Sending ICE candidate");
      socket.emit('signal', { type: 'candidate', candidate: event.candidate });
    }
  };

  // When we receive a data channel from the other side
  peerConnection.ondatachannel = (event) => {
    console.log("Received data channel");
    dataChannel = event.channel;
    setupDataChannelEvents();
  };
}

async function handleOffer(offer) {
  if (peerConnection) {
    console.log("Already have a peer connection, ignoring new offer");
    return;
  }

  isInitiator = false;
  createPeerConnection();

  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    console.log("Remote description set (offer)");

    // Add any candidates that arrived early
    for (const candidate of pendingCandidates) {
      await peerConnection.addIceCandidate(candidate);
    }
    pendingCandidates = [];

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('signal', {
      type: 'answer',
      answer: peerConnection.localDescription
    });
  } catch (err) {
    console.error("Error handling offer:", err);
  }
}

async function handleAnswer(answer) {
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    console.log("Remote description set (answer)");

    // Add any candidates that arrived early
    for (const candidate of pendingCandidates) {
      await peerConnection.addIceCandidate(candidate);
    }
    pendingCandidates = [];
  } catch (err) {
    console.error("Error handling answer:", err);
  }
}

async function handleCandidate(candidate) {
  try {
    const iceCandidate = new RTCIceCandidate(candidate);

    if (peerConnection && peerConnection.remoteDescription) {
      await peerConnection.addIceCandidate(iceCandidate);
    } else {
      // Queue it until remote description is ready
      pendingCandidates.push(iceCandidate);
    }
  } catch (err) {
    console.error("Error adding ICE candidate:", err);
  }
}

// Listen for signals from the other peer
socket.on('signal', async (data) => {
  console.log("Received signal:", data.type);

  if (data.type === 'offer') {
    await handleOffer(data.offer);
  } else if (data.type === 'answer') {
    await handleAnswer(data.answer);
  } else if (data.type === 'candidate') {
    await handleCandidate(data.candidate);
  }
});

// When user clicks Send
send_btn.addEventListener('click', async () => {
  const textValue = text_input.value.trim();
  if (textValue === '') return;

  // If connection is already open → just send the message
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(textValue);
    appendMessageToUI(textValue, "you");
    text_input.value = '';
    return;
  }

  // Otherwise start the connection (become the initiator)
  if (!peerConnection) {
    console.log("Starting WebRTC as initiator...");
    isInitiator = true;
    createPeerConnection();

    // Create the data channel
    dataChannel = peerConnection.createDataChannel('chatChannel');
    setupDataChannelEvents();

    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      socket.emit('signal', {
        type: 'offer',
        offer: peerConnection.localDescription
      });
    } catch (err) {
      console.error("Error creating offer:", err);
    }
  } else {
    console.log("Still waiting for connection to open...");
  }
});