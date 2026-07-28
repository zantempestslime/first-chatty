const send_btn = document.getElementById('send-btn');
const text_input = document.getElementById('text-input');
const text_area = document.getElementById('text-area');

const socket = io('https://first-chatty.onrender.com', {
  transports: ['websocket']
});

let peerConnection = null;
let dataChannel = null;
let pendingCandidates = [];
let isInitiator = false;
let connectionStarted = false;

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
  console.log("Connected to signaling server. ID:", socket.id);
  socket.emit('join', 'casual-chat');
});

function appendMessageToUI(text, senderType) {
  const p = document.createElement('p');
  p.textContent = text;
  p.classList.add('message', senderType);
  text_area.appendChild(p);
  text_area.scrollTop = text_area.scrollHeight;
}

function setupDataChannel(channel) {
  dataChannel = channel;

  dataChannel.onopen = () => {
    console.log("✅ Data channel is OPEN");
    appendMessageToUI("--- Direct WebRTC Connection Established ---", "system");
  };

  dataChannel.onmessage = (e) => {
    appendMessageToUI(e.data, "peer");
  };

  dataChannel.onclose = () => console.log("Data channel closed");
  dataChannel.onerror = (err) => console.error("DataChannel error:", err);
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(configuration);

  peerConnection.oniceconnectionstatechange = () => {
    console.log("ICE state →", peerConnection.iceConnectionState);
  };

  peerConnection.onconnectionstatechange = () => {
    console.log("Connection state →", peerConnection.connectionState);
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', {
        type: 'candidate',
        candidate: event.candidate
      });
    }
  };

  peerConnection.ondatachannel = (event) => {
    console.log("Received data channel");
    setupDataChannel(event.channel);
  };
}

async function startConnection() {
  if (connectionStarted || peerConnection) {
    console.log("Connection already started");
    return;
  }

  connectionStarted = true;
  isInitiator = true;

  try {
    createPeerConnection();

    // Only the initiator creates the data channel
    const channel = peerConnection.createDataChannel("chat");
    setupDataChannel(channel);

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    console.log("Sending offer...");
    socket.emit('signal', {
      type: 'offer',
      offer: peerConnection.localDescription
    });
  } catch (err) {
    console.error("Failed to start connection:", err);
    connectionStarted = false;
  }
}

socket.on('signal', async (data) => {
  try {
    // ========== OFFER ==========
    if (data.type === 'offer') {
      console.log("Received offer");

      // If we already started as initiator, ignore this offer
      if (isInitiator || connectionStarted) {
        console.log("Ignoring offer because we are the initiator");
        return;
      }

      connectionStarted = true;
      createPeerConnection();

      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      console.log("Remote description set (offer)");

      // Add any candidates that arrived early
      for (const c of pendingCandidates) {
        await peerConnection.addIceCandidate(c);
      }
      pendingCandidates = [];

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      console.log("Sending answer...");
      socket.emit('signal', {
        type: 'answer',
        answer: peerConnection.localDescription
      });
    }

    // ========== ANSWER ==========
    else if (data.type === 'answer') {
      console.log("Received answer");

      if (!peerConnection) {
        console.log("No peerConnection yet, ignoring answer");
        return;
      }

      // Only accept the answer if we are waiting for it
      if (peerConnection.signalingState === "have-local-offer") {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        console.log("Remote description set (answer)");

        for (const c of pendingCandidates) {
          await peerConnection.addIceCandidate(c);
        }
        pendingCandidates = [];
      } else {
        console.log("Ignoring answer - current state is:", peerConnection.signalingState);
      }
    }

    // ========== CANDIDATE ==========
    else if (data.type === 'candidate') {
      const candidate = new RTCIceCandidate(data.candidate);

      if (peerConnection && peerConnection.remoteDescription) {
        await peerConnection.addIceCandidate(candidate);
      } else {
        pendingCandidates.push(candidate);
      }
    }
  } catch (err) {
    console.error("Error while handling signal:", err);
  }
});

// When user clicks the Send button
send_btn.addEventListener('click', async () => {
  const text = text_input.value.trim();
  if (!text) return;

  // Already connected → just send the message
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(text);
    appendMessageToUI(text, "you");
    text_input.value = '';
    return;
  }

  // Not connected → start the connection
  console.log("Trying to start connection...");
  await startConnection();
});