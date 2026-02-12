import { createServer } from "http";
import { handler } from "../index.mjs";

const PORT = 3001;

const server = createServer(async (req, res) => {
  // Set CORS headers for ALL responses
  res.setHeader("Access-Control-Allow-Origin", "*"); // Or "http://localhost:3000" if strict
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle Preflight OPTIONS request
  if (req.method === "OPTIONS") {
    console.log("OPTIONS request received - sending 200 OK");
    res.writeHead(200);
    res.end();
    return;
  }

  // Parse Body
  let body = "";
  req.on("data", chunk => {
    body += chunk.toString();
  });

  req.on("end", async () => {
    console.log(`\n Request: ${req.method} ${req.url}`);

    // Construct Lambda Event
    const event = {
      httpMethod: req.method,
      path: req.url, 
      routeKey: `${req.method} ${req.url}`,
      body: body || null,
      headers: req.headers
    };

    try {
      // Invoke Handler
      const result = await handler(event);

      const responseHeaders = {
        "Access-Control-Allow-Origin": "*", // Force allow
        ...(result.headers || {})
      };

      res.writeHead(result.statusCode, responseHeaders);
      res.end(result.body);
      
      console.log(`Response: ${result.statusCode}`);

    } catch (err) {
      console.error("Local Server Error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Local Lambda Server running at http://localhost:${PORT}`);
});
