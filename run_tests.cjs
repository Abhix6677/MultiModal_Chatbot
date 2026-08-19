const http = require('http');

const mockServer = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      const parsed = JSON.parse(body);
      const testCase = parsed.messages[parsed.messages.length - 1].content;
      
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const writeChunk = (text) => {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
      };

      if (testCase === "normal") {
        writeChunk("Normal ");
        writeChunk("response.");
      } else if (testCase === "reasoning") {
        writeChunk("Hello. ");
        writeChunk("<think>\nThinking process...\n</think>\n");
        writeChunk("Final Answer.");
      } else if (testCase === "split") {
        writeChunk("Start ");
        writeChunk("<thi");
        setTimeout(() => {
          writeChunk("nk> inner reasoning </th");
          setTimeout(() => {
            writeChunk("ink> end");
            res.write("data: [DONE]\n\n");
            res.end();
          }, 50);
        }, 50);
        return;
      } else if (testCase === "false_alarm") {
        writeChunk("Here is a ");
        writeChunk("<thi");
        setTimeout(() => {
          writeChunk("s is normal text> for you.");
          res.write("data: [DONE]\n\n");
          res.end();
        }, 50);
        return;
      } else if (testCase === "unclosed") {
        writeChunk("Start ");
        writeChunk("<think> inner reasoning");
        setTimeout(() => {
          res.write("data: [DONE]\n\n");
          res.end();
        }, 50);
        return;
      }

      res.write("data: [DONE]\n\n");
      res.end();
    });
  }
});

mockServer.listen(3001, async () => {
  console.log("Mock upstream server listening on 3001");

  const runTest = async (model, testCase) => {
    return new Promise((resolve) => {
      const req = http.request('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        let output = "";
        res.on('data', chunk => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed.content) output += parsed.content;
              } catch(e) {}
            }
          }
        });
        res.on('end', () => resolve(output));
      });
      req.write(JSON.stringify({
        model: model,
        provider: "custom",
        apiKey: "test",
        messages: [{ role: "user", content: testCase }],
        baseUrl: "http://localhost:3001"
      }));
      req.end();
    });
  };

  try {
    let res = await runTest("mock-qwen-reasoning", "reasoning");
    console.log("Test 1 (Affected model normal tags):", res.includes("Final Answer.") && !res.includes("Thinking process") ? "PASS" : `FAIL - got: ${res}`);

    res = await runTest("mock-qwen-reasoning", "split");
    console.log("Test 2 (Affected model split tags):", res.includes("Start  end") ? "PASS" : `FAIL - got: ${res}`);

    res = await runTest("mock-gpt-4", "reasoning");
    console.log("Test 3 (Normal model bypass):", res.includes("<think>") ? "PASS" : `FAIL - got: ${res}`);

    res = await runTest("mock-gpt-4", "split");
    console.log("Test 3.1 (Normal model bypass split):", res.includes("<think>") ? "PASS" : `FAIL - got: ${res}`);

    res = await runTest("mock-qwen-reasoning", "false_alarm");
    console.log("Test 4 (False alarm):", res.includes("<this is normal text>") ? "PASS" : `FAIL - got: ${res}`);

    res = await runTest("mock-qwen-reasoning", "unclosed");
    console.log("Test 5 (Unclosed tag):", res === "Start " ? "PASS" : `FAIL - got: ${res}`);

  } catch(e) {
    console.error(e);
  } finally {
    mockServer.close();
    process.exit(0);
  }
});
