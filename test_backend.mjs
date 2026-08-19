import http from 'http';

async function testScenario(scenarioName, modelName, expectedOutputSnippet) {
  console.log(`\n========================================`);
  console.log(`TEST: ${scenarioName} (Model: ${modelName})`);
  console.log(`========================================`);
  
  const payload = JSON.stringify({
    provider: "custom",
    baseUrl: "http://localhost:4000/api/v1", // Our mock server
    apiKey: "mock-key",
    model: modelName,
    messages: [{ role: "user", content: "uprr jitne hai sbme best kon hai" }],
    systemPrompt: "You are a helpful assistant",
    temperature: 0.7,
    maxTokens: 100,
    userId: "default_user",
    conversationId: "test_conv_" + modelName,
  });

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        console.log(`\n[Test Result] HTTP Status: ${res.statusCode}`);
        console.log(`[Test Result] Stream Output:\n${data.trim()}`);
        resolve();
      });
    });

    req.on('error', (e) => {
      console.error(`Problem with request: ${e.message}`);
      resolve();
    });

    req.write(payload);
    req.end();
  });
}

async function runAllTests() {
  await testScenario("Normal Response", "mock-normal");
  await testScenario("Empty Response (0 chunks)", "mock-empty");
  await testScenario("Partial Response (abrupt close)", "mock-partial");
  await testScenario("Timeout (>15s without first chunk)", "mock-timeout");
  await testScenario("HTTP Error (429)", "mock-429");
  console.log("\nALL TESTS COMPLETED.");
}

runAllTests();
