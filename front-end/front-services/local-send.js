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
let makingOffer = false;
let ignoreOffer = false;

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
  console.log("Connected. My ID:", mySocketId);
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
    console.log("✅ Data channel OPEN");
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

async function startAsInitiator() {
  if (peerConnection) return;

  try {
    makingOffer = true;
    createPeerConnection();

    // Only initiator creates the data channel
    const channel = peerConnection.createDataChannel('chat');
    setupDataChannel(channel);

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    console.log("Sending offer as initiator");
    socket.emit('signal', {
      type: 'offer',
      offer: peerConnection.localDescription
    });
  } catch (err) {
    console.error("Error creating offer:", err);
  } finally {
    makingOffer = false;
  }
}

socket.on('signal', async (data) => {
  try {
    if (data.type === 'offer') {
      console.log("Received offer");

      // Simple glare protection using socket IDs
      // The peer with the higher ID becomes the initiator
      const offerCollision = makingOffer || (peerConnection && peerConnection.signalingState !== "stable");

      ignoreOffer = offerCollision && mySocketId > data.from; // we need the sender id ideally

      if (ignoreOffer) {
        console.log("Ignoring offer due to glare");
        return;
      }

      if (!peerConnection) {
        createPeerConnection();
      }

      await peerConnection.setRemoteDescription(data.offer);
      console.log("Set remote description (offer)");

      // Add any early candidates
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
    }

    else if (data.type === 'answer') {
      if (!peerConnection) return;

      // Only set answer if we are in the correct state
      if (peerConnection.signalingState === "have-local-offer") {
        await peerConnection.setRemoteDescription(data.answer);
        console.log("Set remote description (answer)");

        for (const c of pendingCandidates) {
          await peerConnection.addIceCandidate(c);
        }
        pendingCandidates = [];
      } else {
        console.log("Ignoring answer - wrong state:", peerConnection.signalingState);
      }
    }

    else if (data.type === 'candidate') {
      const candidate = new RTCIceCandidate(data.candidate);

      if (peerConnection && peerConnection.remoteDescription) {
        await peerConnection.addIceCandidate(candidate);
      } else {
        pendingCandidates.push(candidate);
      }
    }
  } catch (err) {
    console.error("Signal error:", err);
  }
});

// Click Send
send_btn.addEventListener('click', async () => {
  const text = text_input.value.trim();
  if (!text) return;

  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(text);
    appendMessageToUI(text, "you");
    text_input.value = '';
    return;
  }

  // Not connected yet → try to start as initiator
  console.log("Trying to start connection...");
  await startAsInitiator();
});