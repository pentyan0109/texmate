// Custom Next.js server with Yjs WebSocket collaboration support
// Implements y-websocket server-side sync inline (y-websocket v3 removed bin/utils)
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer } = require("ws");
const Y = require("yjs");
const syncProtocol = require("y-protocols/sync");
const awarenessProtocol = require("y-protocols/awareness");
const encoding = require("lib0/encoding");
const decoding = require("lib0/decoding");

const dev  = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000", 10);

// ── Yjs room management ────────────────────────────────────────────────────
const docs = new Map(); // roomName → { doc, awareness, clients: Set }

const MSG_SYNC        = 0;
const MSG_AWARENESS   = 1;

function getRoom(roomName) {
  if (!docs.has(roomName)) {
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    docs.set(roomName, { doc, awareness, clients: new Set() });
  }
  return docs.get(roomName);
}

function sendAll(clients, data, except = null) {
  clients.forEach((c) => {
    if (c !== except && c.readyState === 1 /* OPEN */) c.send(data);
  });
}

function setupWSConnection(ws, roomName) {
  const room = getRoom(roomName);
  const { doc, awareness, clients } = room;
  clients.add(ws);

  // Forward updates to all other clients in same room
  const docUpdateHandler = (update, origin) => {
    if (origin === ws) return;
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeUpdate(enc, update);
    const msg = encoding.toUint8Array(enc);
    sendAll(clients, msg, origin instanceof WebSocket ? origin : null);
  };
  doc.on("update", docUpdateHandler);

  const awarenessUpdateHandler = ({ added, updated, removed }) => {
    const changedClients = added.concat(updated, removed);
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_AWARENESS);
    encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients));
    const msg = encoding.toUint8Array(enc);
    sendAll(clients, msg);
  };
  awareness.on("update", awarenessUpdateHandler);

  // Handle incoming messages
  ws.on("message", (rawData) => {
    const data = rawData instanceof Buffer ? rawData : Buffer.from(rawData);
    const dec = decoding.createDecoder(new Uint8Array(data));
    const msgType = decoding.readVarUint(dec);

    if (msgType === MSG_SYNC) {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      const syncMsgType = syncProtocol.readSyncMessage(dec, enc, doc, ws);
      if (syncMsgType === syncProtocol.messageYjsSyncStep2) {
        // Broadcast update to other clients (handled by doc "update" event)
      }
      if (encoding.length(enc) > 1) {
        ws.send(encoding.toUint8Array(enc));
      }
    } else if (msgType === MSG_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(dec), ws);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    doc.off("update", docUpdateHandler);
    awareness.off("update", awarenessUpdateHandler);
    awarenessProtocol.removeAwarenessStates(awareness, [doc.clientID], null);
    // Clean up empty rooms
    if (clients.size === 0) docs.delete(roomName);
  });

  // Send sync step 1
  const syncEnc = encoding.createEncoder();
  encoding.writeVarUint(syncEnc, MSG_SYNC);
  syncProtocol.writeSyncStep1(syncEnc, doc);
  ws.send(encoding.toUint8Array(syncEnc));

  // Send current awareness
  const states = awareness.getStates();
  if (states.size > 0) {
    const awEnc = encoding.createEncoder();
    encoding.writeVarUint(awEnc, MSG_AWARENESS);
    encoding.writeVarUint8Array(awEnc, awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(states.keys())));
    ws.send(encoding.toUint8Array(awEnc));
  }
}

// ── Next.js + HTTP server ──────────────────────────────────────────────────
const app    = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  const wss = new WebSocketServer({ noServer: true });
  wss.on("connection", (ws, req) => {
    const url   = new URL(req.url, "http://localhost");
    const room  = url.searchParams.get("room") ?? "default";
    setupWSConnection(ws, room);
  });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url);
    if (pathname === "/api/collab") {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    } else {
      socket.destroy();
    }
  });

  server.listen(port, () => {
    console.log(`> TexMate ready on http://localhost:${port}`);
  });
});
