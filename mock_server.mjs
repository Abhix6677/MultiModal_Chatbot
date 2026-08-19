import http from 'http';

const server = http.createServer((req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/v1/chat/completions') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      let model = "";
      try {
        const payload = JSON.parse(body);
        model = payload.model || "";
      } catch (e) {}

      if (model === "mock-empty") {
        console.log("Mocking EMPTY response");
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end();
      } 
      else if (model === "mock-partial") {
        console.log("Mocking PARTIAL response");
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Java is a " } }] })}\n\n`);
        setTimeout(() => {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "programming language" } }] })}\n\n`);
          setTimeout(() => {
            req.socket.destroy();
          }, 500);
        }, 500);
      }
      else if (model === "mock-timeout") {
        console.log("Mocking TIMEOUT response");
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        setTimeout(() => {
           res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Finally here!" } }] })}\n\n`);
           res.write("data: [DONE]\n\n");
           res.end();
        }, 16000);
      }
      else if (model === "mock-429") {
        console.log("Mocking 429 response");
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: "Rate limit exceeded" } }));
      }
      else {
        console.log("Mocking NORMAL response");
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Hello " } }] })}\n\n`);
        setTimeout(() => {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "World!" } }] })}\n\n`);
          res.write("data: [DONE]\n\n");
          res.end();
        }, 500);
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(4000, () => {
  console.log("Mock server listening on port 4000");
});
