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
  iceTransportPolicy: "relay", // Force TURN for testing
  iceServers: [
    {
      urls: "turn:standard.relay.metered.ca:80",
      username: "95e33d67d86cedc472faf8ef",
      credential: "8XwF3aZRR1yMQF1j",
    },
    {
      urls: "turn:standard.relay.metered.ca:80?transport=tcp",
      username: "95e33d67d86cedc472faf8ef",
      credential: "8XwF3aZRR1yMQF1j",
    },
    {
      urls: "turn:standard.relay.metered.ca:443",
      username: "95e33d67d86cedc472faf8ef",
      credential: "8XwF3aZRR1yMQF1j",
    },
    {
      urls: "turns:standard.relay.metered.ca:443?transport=tcp",
      username: "95e33d67d86cedc472faf8ef",
      credential: "8XwF3aZRR1yMQF1j",
    },
  ]
};

// Helper to show status on screen
function showStatus(text) {
  const p = document.createElement('p');
  p.textContent = "🔧 " + text;
  p.style.color = "#555";
  p.style.fontSize = "13px";
  p.style.margin = "4px 0";
  text_area.appendChild(p);
  text_area.scrollTop = text_area.scrollHeight;
  console.log(text); // still log to console if available
}

function appendMessageToUI(text, senderType) {
  const p = document.createElement('p');
  p.textContent = text;
  p.classList.add('message', senderType);
  text_area.appendChild(p);
  text_area.scrollTop = text_area.scrollHeight;
}

socket.on('connect', () => {
  showStatus("Connected to signaling server. ID: " + socket.id);
  socket.emit('join', 'casual-chat');
});

function setupDataChannel(channel) {
  dataChannel = channel;

  dataChannel.onopen = () => {
    showStatus("✅ Data channel is OPEN - you can chat now!");
    appendMessageToUI("--- Direct WebRTC Connection Established ---", "system");
  };

  dataChannel.onmessage = (e) => {
    appendMessageToUI(e.data, "peer");
  };

  dataChannel.onclose = () => showStatus("Data channel closed");
  dataChannel.onerror = (err) => showStatus("DataChannel error: " + err);
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(configuration);

  peerConnection.oniceconnectionstatechange = () => {
    showStatus("ICE state → " + peerConnection.iceConnectionState);
  };

  peerConnection.onconnectionstatechange = () => {
    showStatus("Connection state → " + peerConnection.connectionState);
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
    showStatus("Received data channel from other peer");
    setupDataChannel(event.channel);
  };
}

async function startConnection() {
  if (connectionStarted || peerConnection) {
    showStatus("Connection already started");
    return;
  }

  connectionStarted = true;
  isInitiator = true;
  showStatus("Starting as initiator...");

  try {
    createPeerConnection();

    const channel = peerConnection.createDataChannel("chat");
    setupDataChannel(channel);

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    showStatus("Sending offer...");
    socket.emit('signal', {
      type: 'offer',
      offer: peerConnection.localDescription
    });
  } catch (err) {
    showStatus("Failed to start: " + err.message);
    connectionStarted = false;
  }
}

socket.on('signal', async (data) => {
  try {
    if (data.type === 'offer') {
      showStatus("Received offer");

      if (isInitiator || connectionStarted) {
        showStatus("Ignoring offer (we are initiator)");
        return;
      }

      connectionStarted = true;
      createPeerConnection();

      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      showStatus("Remote description set (offer)");

      for (const c of pendingCandidates) {
        await peerConnection.addIceCandidate(c);
      }
      pendingCandidates = [];

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      showStatus("Sending answer...");
      socket.emit('signal', {
        type: 'answer',
        answer: peerConnection.localDescription
      });
    }

    else if (data.type === 'answer') {
      showStatus("Received answer");

      if (!peerConnection) {
        showStatus("No peerConnection yet, ignoring answer");
        return;
      }

      if (peerConnection.signalingState === "have-local-offer") {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        showStatus("Remote description set (answer)");

        for (const c of pendingCandidates) {
          await peerConnection.addIceCandidate(c);
        }
        pendingCandidates = [];
      } else {
        showStatus("Ignoring answer - state is: " + peerConnection.signalingState);
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
    showStatus("Error: " + err.message);
  }
});

send_btn.addEventListener('click', async () => {
  const text = text_input.value.trim();
  if (!text) return;

  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(text);
    appendMessageToUI(text, "you");
    text_input.value = '';
    return;
  }

  showStatus("Trying to start connection...");
  await startConnection();
});