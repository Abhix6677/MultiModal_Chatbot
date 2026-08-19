const testQueries = [
  "Hello",
  "What is Java?",
  "Explain binary tree",
  "What is 2 + 2?",
  "Write a Java loop",
  "teri sister",
  "tu pagal hai kyaa",
  "aree you serious"
];

async function runTests() {
  for (const query of testQueries) {
    console.log(`\n\n--- TESTING QUERY: "${query}" ---`);
    const startTime = Date.now();
    let ttft = null;
    let chunks = 0;
    
    try {
      const response = await fetch("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "custom",
          baseUrl: "https://swimmer-debtless-pushchair.ngrok-free.dev/api/v1",
          apiKey: "test",
          model: "oc/hy3-free",
          messages: [{ role: "user", content: query }],
          systemPrompt: "- Always respond concisely.\n- Never use filler phrases.",
          temperature: 0.7,
          userId: "default_user",
          conversationId: "test_conv_" + Date.now()
        })
      });

      if (!response.ok) {
        console.error(`HTTP Error: ${response.status} - ${await response.text()}`);
        continue;
      }

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalResponse = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          if (ttft === null) {
            ttft = Date.now() - startTime;
          }
          chunks++;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.replace("data: ", "").trim();
              if (dataStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.content) {
                  finalResponse += parsed.content;
                }
              } catch (e) {}
            }
          }
        }
        const totalTime = Date.now() - startTime;
        console.log(`[Metrics] TTFT: ${ttft}ms | Total: ${totalTime}ms | Chunks: ${chunks}`);
        console.log(`[Response] ${finalResponse.trim().substring(0, 100)}...`);
      }
    } catch (e) {
      console.error(`[Error] ${e.message}`);
    }
    
    await new Promise(r => setTimeout(r, 2000));
  }
}

runTests();
