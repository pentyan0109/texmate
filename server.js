// Custom Next.js server with Yjs WebSocket collaboration support
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer } = require("ws");
const { setupWSConnection } = require("y-websocket/bin/utils");

const dev  = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000", 10);

const app     = next({ dev });
const handle  = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Attach Yjs WebSocket server at /api/collab
  const wss = new WebSocketServer({ noServer: true });
  wss.on("connection", (ws, req) => {
    // Extract room name from URL: /api/collab?room=project:file
    const url = new URL(req.url, "http://localhost");
    const room = url.searchParams.get("room") ?? "default";
    setupWSConnection(ws, req, { docName: room });
  });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url);
    if (pathname === "/api/collab") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  server.listen(port, () => {
    console.log(`> TexMate ready on http://localhost:${port}`);
  });
});
