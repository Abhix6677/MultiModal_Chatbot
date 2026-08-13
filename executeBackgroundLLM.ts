async function executeBackgroundLLM(modelsString: string, prompt: string, maxTokens: number = 4096): Promise<string> {
  const models = modelsString.split(',').map(m => m.trim()).filter(Boolean);
  
  let lastError = null;

  for (const model of models) {
    let baseUrl = process.env.VITE_API_BASE_URL || "http://localhost:8000/v1";
    let apiKey = process.env.VITE_API_KEY || "sk-dummy";
    
    // Attempt to use smart routing if the model is tracked
    if (modelRoutingMap[model]) {
      baseUrl = modelRoutingMap[model].baseUrl;
      apiKey = modelRoutingMap[model].apiKey;
    }

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: maxTokens,
          stream: false,
        }),
      });

      if (!response.ok) {
        lastError = new Error(`[Background LLM] ${model} on ${baseUrl} failed: ${response.statusText}`);
        console.warn(lastError.message);
        continue;
      }

      const rawText = await response.text();
      try {
        const data = JSON.parse(rawText);
        if (data.choices && data.choices[0]) {
           return data.choices[0].message.content.trim();
        }
      } catch (e) {
        // SSE fallback
        let extractedText = "";
        const lines = rawText.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && !line.includes("[DONE]")) {
            try {
              const chunk = JSON.parse(line.substring(6));
              const content = chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.text || "";
              if (content) extractedText += content;
            } catch (err) {}
          }
        }
        if (extractedText) return extractedText.trim();
      }
    } catch (e: any) {
      lastError = e;
      console.warn(`[Background LLM] ${model} fetch exception:`, e.message);
      continue;
    }
  }
  
  throw lastError || new Error("All fallback models failed.");
}
