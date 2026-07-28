const send_btn = document.getElementById('send-btn');
const text_input = document.getElementById('text-input');
const text_area = document.getElementById('text-area');

const socket = io('https://first-chatty.onrender.com', {
  transports: ['websocket']
});

let peerConnection = null;
let dataChannel = null;
let pendingCandidates = [];
let mySocketId = null;
let isMakingOffer = false;

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

socket.on('connect', () => {
  mySocketId = socket.id;
  console.log("Connected to signaling server. My ID:", mySocketId);
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
    console.log("✅ Data channel is OPEN");
    appendMessageToUI("--- Direct WebRTC Connection Established ---", "system");
  };

  dataChannel.onmessage = (event) => {
    appendMessageToUI(event.data, "peer");
  };

  dataChannel.onclose = () => console.log("Data channel closed");
  dataChannel.onerror = (err) => console.error("Data channel error:", err);
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(configuration);

  peerConnection.oniceconnectionstatechange = () => {
    console.log("ICE Connection State →", peerConnection.iceConnectionState);
  };

  peerConnection.onconnectionstatechange = () => {
    console.log("Connection State →", peerConnection.connectionState);
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { type: 'candidate', candidate: event.candidate });
    }
  };

  peerConnection.ondatachannel = (event) => {
    console.log("Received data channel from other peer");
    dataChannel = event.channel;
    setupDataChannelEvents();
  };
}

async function makeOffer() {
  if (isMakingOffer || peerConnection) return;

  try {
    isMakingOffer = true;
    createPeerConnection();

    // Only the initiator creates the data channel
    dataChannel = peerConnection.createDataChannel('chatChannel');
    setupDataChannelEvents();

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    console.log("Sending offer...");
    socket.emit('signal', {
      type: 'offer',
      offer: peerConnection.localDescription
    });
  } catch (err) {
    console.error("Error creating offer:", err);
  } finally {
    isMakingOffer = false;
  }
}

async function handleOffer(offer) {
  // If we are currently making an offer, ignore this one (glare protection)
  if (isMakingOffer) {
    console.log("Ignoring offer because we are currently making one");
    return;
  }

  try {
    if (!peerConnection) {
      createPeerConnection();
    }

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    console.log("Remote description set (offer)");

    // Add queued candidates
    for (const c of pendingCandidates) {
      await peerConnection.addIceCandidate(c);
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
    if (!peerConnection) return;

    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    console.log("Remote description set (answer)");

    for (const c of pendingCandidates) {
      await peerConnection.addIceCandidate(c);
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
      pendingCandidates.push(iceCandidate);
    }
  } catch (err) {
    console.error("Error adding ICE candidate:", err);
  }
}

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
  if (!textValue) return;

  // Already connected → just send
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(textValue);
    appendMessageToUI(textValue, "you");
    text_input.value = '';
    return;
  }

  // Not connected yet → start the connection
  console.log("Trying to start connection...");
  await makeOffer();
});