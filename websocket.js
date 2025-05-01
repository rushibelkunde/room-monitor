// server.js
import uWS from "uWebSockets.js";
import mediasoup from "mediasoup";
import fs from "fs";
import { spawn } from "child_process";
import net from "net";
import AWS from "aws-sdk";
import dotenv from "dotenv";


dotenv.config();

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

const PORT = 3001;

const rooms = {};
const clients = new Map();


function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

const worker = await mediasoup.createWorker();
console.log("MediaSoup worker created");

const app = uWS.App().ws("/*", {
  compression: uWS.SHARED_COMPRESSOR,
  maxPayloadLength: 16 * 1024,
  idleTimeout: 60,

  open: (ws) => {
    const id = generateId();
    ws.id = id;
    ws.role = null;
    clients.set(id, ws);
    ws.subscriptions = new Set();
    console.log(`Client connected: ${id}`);
  },

  message: async (ws, message, isBinary) => {
    const msg = Buffer.from(message).toString();
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      console.error("Invalid JSON:", e);
      return;
    }

    const { type, payload } = data;

    console.log(type);

    switch (type) {
      case "joinRoom":
        await handleJoinRoom(ws, payload);
        broadcastActiveRooms();
        break;
      case "createWebRtcTransport":
        await handleCreateTransport(ws, payload);
        break;
      case "connectTransport":
        await handleConnectTransport(ws, payload);
        break;
      case "produce":
        await handleProduce(ws, payload);
        break;
      case "consume":
        await handleConsume(ws, payload);
        break;
      case "requestActiveRooms":
        handleRequestActiveRooms(ws, payload);
        break;
      case "adminMessage":
        handleAdminMessage(ws, payload);
        break;
      case "participantMessage":
        handleParticipantMessage(ws, payload);
        break;
      default:
        console.warn("Unknown message type:", type);
    }
  },

  close: (ws, code, message) => {
   
    clients.delete(ws.id);

    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.peers[ws.id]) {
        broadcast(roomId, {
          type: "participantLeft",
          payload: { userId: room.peers[ws.id].userId, roomId },
        });
        delete room.peers[ws.id];
        if (Object.keys(room.peers).length === 0) {
          delete rooms[roomId];
          broadcastActiveRooms();
        }
      }
    }
    console.log(`IN CLOSE Client disconnected: ${ws.id}`);
  },
});

app.listen(PORT, (token) => {
  if (token) {
    console.log(`Server is listening on port ${PORT}`);
  } else {
    console.log("Failed to listen on port", PORT);
  }
});

// Helper Functions

function send(ws, type, payload, ackId = undefined) {
  try {
    // uWebSockets.js correct check for closed ws
    if (!ws || ws.getBufferedAmount() === undefined) {
      console.warn("Trying to send on closed socket, skipping...");
      return;
    }

    ws.send(JSON.stringify({ type, payload, ...(ackId && { ackId }) }));
  } catch (err) {
    console.error("Send error:", err.message);
  }
}

function broadcast(roomId, message) {
  const room = rooms[roomId];
  if (!room) return;
  for (const peerId in room.peers) {
    const client = clients.get(peerId);
    if (client) {
      client.send(JSON.stringify(message));
    }
  }
}

function broadcastActiveRooms() {
  const activeRooms = Object.entries(rooms)
    .map(([roomId, room]) => ({
      roomId
    }));

  for (const ws of clients.values()) {
    
    const peerData = getPeerByWs(ws); // we will create this helper

    if (
      peerData &&
      ws.getBufferedAmount() !== undefined
    ) {
      send(ws, "activeRoomsUpdate", activeRooms);
    }
  }
}

function getPeerByWs(ws) {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (room.peers[ws.id]) {
      return { room };
    }
  }
  return null;
}


async function handleJoinRoom(
  ws,
  { roomId, role, userId }
) {
  console.log("userId", userId);
  if (!rooms[roomId]) {
    const router = await worker.createRouter({
      mediaCodecs: [
        {
          kind: "video",
          mimeType: "video/VP8",
          clockRate: 90000,
          parameters: {},
          preferredPayloadType: 96,
        },
      ],
    });
    rooms[roomId] = { router, peers: {} };
    console.log(rooms);
  }

  rooms[roomId].peers[ws.id] = {
    transports: [],
    producers: [],
    consumers: [],
    role,
    userId,
  };

  ws.subscriptions.add(roomId);
  send(ws, "routerRtpCapabilities", rooms[roomId].router.rtpCapabilities);

  const producersInfo = Object.entries(rooms[roomId].peers)
    .filter(([id, peer]) => id !== ws.id && peer.producers.length > 0)
    .map(([_, peer]) => ({
      userId: peer.userId,
      producerId: peer.producers[0].id,
    }));

  if (producersInfo.length > 0) {
    send(ws, "newProducer", producersInfo);
  }
}

async function handleCreateTransport(ws, { roomId }) {
  const router = rooms[roomId].router;
  const transport = await router.createWebRtcTransport({
    listenIps: [{ ip: "0.0.0.0", announcedIp: process.env.PUBLIC_IP }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });

  rooms[roomId].peers[ws.id].transports.push(transport);

  send(ws, "createWebRtcTransport", {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  });

  transport.on("dtlsstatechange", (state) => {
    if (state === "closed") transport.close();
  });
}

async function handleConnectTransport(
  ws,
  { transportId, dtlsParameters, roomId }
) {
  const transport = rooms[roomId].peers[ws.id].transports.find(
    (t) => t.id === transportId
  );
  await transport.connect({ dtlsParameters });
}

async function handleProduce(
  ws,
  { kind, rtpParameters, transportId, roomId, ackId }
) {
  const peer = rooms[roomId].peers[ws.id];
  const router = rooms[roomId].router;
  const transport = peer.transports.find((t) => t.id === transportId);

  const producer = await transport.produce({ kind, rtpParameters });

  peer.producers.push(producer);

  broadcast(roomId, {
    type: "newProducer",
    payload: {
      producerId: producer.id,
      userId: peer.userId,
    },
  });

  send(ws, "produce", { id: producer.id }, ackId);

  console.log("Detected video producer, starting recording...");

  // Setup PlainTransport
  const rtpPort = await getFreePort();
  const rtcpPort = await getFreePort();

  console.log(rtcpPort, rtcpPort);

  const plainTransport = await router.createPlainTransport({
    listenIp: { ip: process.env.PUBLIC_IP },
    rtcpMux: false,
    comedia: false,
  });

  await plainTransport.connect({
    ip: process.env.PUBLIC_IP,
    port: rtpPort,
    rtcpPort: rtcpPort,
  });

  // Consume Producer in PlainTransport
  const consumer = await plainTransport.consume({
    producerId: producer.id,
    rtpCapabilities: router.rtpCapabilities,
    paused: false,
  });

  await consumer.setPreferredLayers({ spatialLayer: 2, temporalLayer: 2 });

  console.log("Recording PlainTransport Consumer Created");

  startRecording(peer, roomId, rtpPort, rtcpPort);
}

async function handleConsume(ws, { rtpCapabilities, roomId }) {
  const router = rooms[roomId]?.router;
  const peers = rooms[roomId]?.peers;

  if (!router || !peers) return;

  const peerData = peers[ws.id];

  if (!peerData || !peerData.transports.length) {
    console.warn("No transport found for this client, skipping consume");
    send(ws, "consume", []); // return empty array to client
    return;
  }

  const transport = peerData.transports[0]; // assuming first transport always recv transport

  const results = [];

  for (const peerId in peers) {
    if (peerId === ws.id) continue;

    const peer = peers[peerId];
    const producer = peer.producers[0];
    if (!producer) continue;

    if (router.canConsume({ producerId: producer.id, rtpCapabilities })) {
      const consumer = await transport.consume({
        producerId: producer.id,
        rtpCapabilities,
        paused: false,
      });

      peerData.consumers.push(consumer);

      results.push({
        id: consumer.id,
        producerId: producer.id,
        userId: peer.userId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
    }
  }

  console.log("results", results);

  send(ws, "consume", results);
}

function handleRequestActiveRooms(ws, {  }) {
  console.log("In Request Active Rooms");
  const filteredRooms = Object.entries(rooms)
    .map(([roomId, room]) => ({
      roomId
    }));

  console.log("filteredRooms", filteredRooms);
  console.log(ws);

  send(ws, "activeRoomsUpdate", filteredRooms);
}

function handleAdminMessage(ws, { roomId, fromuserId, touserId, message }) {
  const room = rooms[roomId];
  if (!room) return;

  console.log("handleadminmessage", fromuserId,  touserId, message)

  for (const [peerId, peer] of Object.entries(room.peers)) {
    if (peer.userId === touserId) {
      const client = clients.get(peerId);
      if (client) send(client, "receiveMessage", { from: fromuserId, message });
    }
  }
}

function handleParticipantMessage(
  ws,
  { roomId, fromuserId, message }
) {
  console.log("handleparticipant", fromuserId, message)
  const room = rooms[roomId];
  console.log(room);
  if (!room) return;

  for (const [peerId, peer] of Object.entries(room.peers)) {
    if (peer.role === "admin") {
      const client = clients.get(peerId);
      console.log("adminclient", client);
      if (client)
        send(client, "receiveMessage", { from: fromuserId, message });
    }
  }

  // Show message in participant's chat also
  send(ws, "receiveMessage", { from: fromuserId, message });
}



function buildRecordingKey({roomId, userId, fileExt = "webm" }) {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10); // '2025-04-14'
  const timePart = now.toISOString().replace(/[-:.]/g, "").slice(0, 15); // '20250414T101530'
  return {
    folderPath: `recordings/room_${roomId}/${datePart}`,
    filePath: `recordings/room_${roomId}/${datePart}/user_${userId}_${timePart}.${fileExt}`,
  };
}

function startRecording(peer, roomId, rtpPort, rtcpPort) {
  const localFilePath = buildRecordingKey({
    roomId,
    userId: peer.userId,
  }).filePath;
  const s3Key = `<your-s3_key>/${
    buildRecordingKey({
      roomId,
      userId: peer.userId,
    }).filePath
  }`; // Destination path in Spaces

  // Ensure recordings directory exists
  fs.mkdirSync(
    buildRecordingKey({
      roomId,
      userId: peer.userId,
    }).folderPath,
    { recursive: true }
  );

  const gstLaunchCmd = `
      gst-launch-1.0 -v udpsrc port=${rtpPort} caps="application/x-rtp, media=video, encoding-name=VP8, payload=96" !
      rtpvp8depay ! vp8dec ! videoconvert ! vp8enc cpu-used=0 deadline=1 target-bitrate=2000000 ! webmmux ! filesink location=${localFilePath}
    `
    .replace(/\s\s+/g, " ")
    .trim();

  const gst = spawn("bash", ["-c", gstLaunchCmd]);

  gst.stderr.on("data", (data) => {
    console.error(`GStreamer stderr: ${data}`);
  });

  gst.stdout.on("data", (data) => {
    console.log(`GStreamer stdout: ${data}`);
  });

  gst.on("exit", (code) => {
    console.log(
      `🎬 Recording finished for ${peer.userId}, file saved: ${localFilePath} (Exit code: ${code})`
    );

    if (process.env.SPACE == "cloud") {
      const spacesEndpoint = new AWS.Endpoint(process.env.SPACES_ENDPOINT);
      const s3 = new AWS.S3({
        endpoint: spacesEndpoint,
        accessKeyId: process.env.SPACES_ACCESS_KEY,
        secretAccessKey: process.env.SPACES_SECRET_KEY,
      });
      const fileStream = fs.createReadStream(localFilePath);
      fileStream.on("error", (err) => console.error("File Read Error", err));

      const uploadParams = {
        Bucket: "algo-staging",
        Key: s3Key,
        Body: fileStream,
        ACL: "private", // or 'public-read' if you want it accessible
        ContentType: "video/webm",
      };

      s3.upload(uploadParams, (err, data) => {
        if (err) {
          console.error("❌ Upload error:", err);
        } else {
          console.log(`✅ Uploaded to DigitalOcean Spaces: ${data.Location}`);
          // Optional: delete local file after upload
          fs.unlink(localFilePath, () => {});
        }
      });
    }

    peer.recordingProcess = null;
  });

  peer.recordingProcess = gst;
}


