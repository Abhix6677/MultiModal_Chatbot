import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import * as cheerio from 'cheerio';
import fs from "fs";

function getDynamicEnv(key: string): string | undefined {
  try {
    if (fs.existsSync(".env")) {
      const parsed = dotenv.parse(fs.readFileSync(".env", "utf-8"));
      if (parsed[key] !== undefined) return parsed[key];
    }
  } catch (e) {
    // ignore
  }
  return process.env[key];
}


dotenv.config();

function deduplicateEnvFile() {
  try {
    if (fs.existsSync(".env")) {
      let content = fs.readFileSync(".env", "utf-8");
      const match = content.match(/^VITE_API_MODELS=(.*)$/m);
      if (match) {
        let rawLine = match[1];
        let innerStr = rawLine;
        const hasDoubleQuotes = rawLine.startsWith('"') && rawLine.endsWith('"');
        const hasSingleQuotes = rawLine.startsWith("'") && rawLine.endsWith("'");
        if (hasDoubleQuotes || hasSingleQuotes) {
          innerStr = rawLine.slice(1, -1);
        }
        
        const models = innerStr.split(",").map(m => m.trim()).filter(Boolean);
        const uniqueModels = Array.from(new Set(models));
        
        if (models.length !== uniqueModels.length) {
          const uniqueLine = hasDoubleQuotes ? `"${uniqueModels.join(",")}"` : hasSingleQuotes ? `'${uniqueModels.join(",")}'` : uniqueModels.join(",");
          content = content.replace(/^VITE_API_MODELS=.*$/m, `VITE_API_MODELS=${uniqueLine}`);
          fs.writeFileSync(".env", content, "utf-8");
          console.log("[Server] Automatically deduplicated VITE_API_MODELS in .env file");
        }
      }
    }
  } catch (e) {
    console.error("[Server] Failed to deduplicate .env file:", e);
  }
}

deduplicateEnvFile();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ limit: "200mb", extended: true }));

// Helper to normalize base URL
function normalizeBaseUrl(url: string): string {
  if (!url) return "";
  let clean = url.trim();
  if (clean.endsWith("/")) {
    clean = clean.slice(0, -1);
  }
  return clean;
}

// Helper to build OpenAI full URL
function getOpenAICompletionsUrl(baseUrl: string): string {
  const clean = normalizeBaseUrl(baseUrl);
  if (clean.endsWith("/chat/completions")) {
    return clean;
  }
  if (clean.endsWith("/v1")) {
    return `${clean}/chat/completions`;
  }
  return `${clean}/v1/chat/completions`;
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Test Connection Endpoint
app.post("/api/test-connection", async (req, res) => {
  try {
    const { provider, baseUrl, apiKey, model } = req.body;

    if (provider === "gemini" && (!apiKey || apiKey === "ENV_KEY")) {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        return res.status(400).json({ error: "No Gemini API key found in environment or configuration." });
      }
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: model || "gemini-2.5-flash",
        contents: "Hi",
      });
      return res.json({ success: true, message: "Connection successful!", sample: response.text });
    }

    if (!apiKey && provider !== "ollama" && provider !== "custom" && provider !== "lmstudio" && !baseUrl?.includes("localhost") && !baseUrl?.includes("127.0.0.1")) {
      return res.status(400).json({ error: "API Key is required for this provider." });
    }

    if (provider === "anthropic") {
      const url = `${normalizeBaseUrl(baseUrl || "https://api.anthropic.com/v1")}/messages`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: model || "claude-3-5-sonnet-20241022",
          max_tokens: 10,
          messages: [{ role: "user", content: "Hi" }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: `Anthropic Error (${response.status}): ${errorText}` });
      }

      const data = await response.json();
      return res.json({ success: true, message: "Connected to Anthropic API successfully!", sample: data });
    }

    let finalBaseUrl = baseUrl || "https://api.openai.com";
    let finalApiKey = apiKey;
    
    if (process.env.VITE_OPENROUTER_FREE_MODELS?.split(',').map(m => m.trim()).includes(model)) {
      finalBaseUrl = process.env.VITE_OPENROUTER_FREE_MODEL_BASE_URL || "https://openrouter.ai/api/v1";
      finalApiKey = process.env.VITE_OPENROUTER_FREE_MODEL_API_KEY || finalApiKey;
    }

    const targetUrl = getOpenAICompletionsUrl(finalBaseUrl);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (finalApiKey) {
      headers["Authorization"] = `Bearer ${finalApiKey}`;
    }
    if (provider === "openrouter") {
      headers["HTTP-Referer"] = "https://ai.studio";
      headers["X-Title"] = "Universal Chatbot";
    }

    const testResponse = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 10,
      }),
    });

    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      if (errorText.includes("idtoken") || errorText.includes("Invalid token") || (testResponse.status === 401 && (baseUrl?.includes("localhost") || baseUrl?.includes("127.0.0.1")))) {
        return res.status(401).json({
          error: `Cloud Container Notice: You entered '${baseUrl}'. Since this web app runs in Cloud Run, 'localhost' points to the cloud container (which returned a 401 GCP Auth token error), NOT your personal computer! To connect your PC's local server (LM Studio, vLLM, Ollama, etc.): 1) Run 'ngrok http 8000' (or localtunnel) on your PC and paste the public HTTPS URL (e.g. https://xyz.ngrok-free.app/v1), OR 2) Enable Direct Browser Fetch.`
        });
      }
      return res.status(testResponse.status).json({ error: `API Error (${testResponse.status}): ${errorText}` });
    }

    const data = await testResponse.json();
    return res.json({ success: true, message: "Connection successful!", sample: data });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to connect to API endpoint." });
  }
});

// Memory Summarizer Endpoint
async function executeBackgroundLLM(modelsString: string, prompt: string, maxTokens: number = 4096): Promise<string> {
  const models = modelsString.split(',').map(m => m.trim()).filter(Boolean);
  
  let lastError = null;

  for (const model of models) {
    const endpointsToTry = [
      { baseUrl: process.env.VITE_API_BASE_URL || "", apiKey: process.env.VITE_API_KEY || "" },
      { baseUrl: process.env.VITE_OMNIROUTE_2_BASE_URL || "", apiKey: process.env.VITE_OMNIROUTE_2_API_KEY || "" }
    ];

    if (modelRoutingMap[model]) {
      endpointsToTry.unshift(modelRoutingMap[model]);
    }

    for (const endpoint of endpointsToTry) {
      if (!endpoint.baseUrl || !endpoint.apiKey) continue;

      try {
        const response = await fetch(`${endpoint.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${endpoint.apiKey}`
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
          const errText = await response.text();
          lastError = new Error(`[Background LLM] ${model} on ${endpoint.baseUrl} failed: ${response.status} - ${errText}`);
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
  }
  
  throw lastError || new Error("All fallback models failed.");
}

app.post("/api/summarize-memory", async (req, res) => {
  try {
    const { provider, baseUrl, apiKey, model, historyText, existingMemory } = req.body;

    const memoryPrompt = `Analyze the following chat conversation history. Extract and update a bullet-point list of KEY LONG-TERM MEMORY FACTS that must be remembered forever.
    
    CRITICAL INSTRUCTIONS:
    1. Summarize BOTH what the User asked/said AND what the Assistant (you) taught or provided (e.g., solutions, approaches, code structure).
    2. SELF-CORRECTION (LAYER 1 LEARNING): If the User corrects the Assistant (e.g., "you are wrong", "don't do X", "it should be Y"), you MUST extract this as a permanent rule so the Assistant never repeats the mistake.
    
    Include:
    - User's name, preferences, goals, and background info.
    - Core concepts, questions, or problems the user asked about.
    - IMPORTANT: The specific solutions, approaches, and technical details the Assistant provided.
    - RULES & AVOIDANCES: Explicit list of mistakes the Assistant made and what the User said to do instead.
    
    Existing Memory:
    ${existingMemory || "None yet."}
    
    Recent Conversation History:
    ${historyText || "No prior history."}
      
      Format output purely as clean bullet points under "Core Long-Term Memory (Preserved from Day 1):" and a separate section for "Learned Rules & Corrections:". 
      CRITICAL: DO NOT output a raw line-by-line transcript of the conversation! You are a summarizer. Extract the core architectural facts, problem statements, solutions, and rules into a consolidated summary.`;

    // Fallback LLM API for Memory Summarization
    try {
      const userModels = getDynamicEnv("VITE_MEMORY_SUMMARIZER_MODEL") || "antigravity/gemini-3.6-flash-low";
      // ALWAYS append gemini as the absolute final fallback because it has a 2M token context window!
      // This prevents 400 Context Length Exceeded errors if the user's chosen model (like glm-5-2) can't handle the huge memory payload.
      const modelsString = `${userModels},antigravity/gemini-3.6-flash-low`;
      
      const memoryText = await executeBackgroundLLM(modelsString, memoryPrompt, 4096);
      return res.json({ memory: memoryText });
    } catch (e: any) {
      console.error("Hardcoded summarize error:", e.message);
    }

    // 4. Pure structured extraction fallback if no LLM API is reachable
    if (historyText && historyText.trim().length > 0) {
      const lines = historyText.split("\n").filter((l) => l.trim().length > 0);
      
      const extractedPoints: string[] = [];
      let currentRole = "";
      
      for (const line of lines) {
        if (line.startsWith("USER:")) {
          currentRole = "USER";
          extractedPoints.push(`- (User) ${line.replace("USER:", "").trim().substring(0, 80)}...`);
        } else if (line.startsWith("ASSISTANT:")) {
          currentRole = "ASSISTANT";
          extractedPoints.push(`  -> (AI) ${line.replace("ASSISTANT:", "").trim().substring(0, 150)}...`);
        }
        
        if (extractedPoints.length >= 10) break; // Keep fallback concise
      }

      let fallbackText = `Core Long-Term Memory (Preserved from Day 1):\n[Note: Auto-summary API unreachable, using raw fallback]\n`;
      if (existingMemory && !existingMemory.includes("Auto-summary API unreachable")) {
        fallbackText += `${existingMemory}\n`;
      }
      if (extractedPoints.length > 0) {
        fallbackText += extractedPoints.join("\n");
      } else {
        fallbackText += `- Topic: ${lines[0] || "General conversation"}`;
      }
      return res.json({ memory: fallbackText });
    }

    return res.json({
      memory: existingMemory || "Core Long-Term Memory (Preserved from Day 1):\n- Session initialized and active.",
    });
  } catch (err: any) {
    return res.json({
      memory: req.body.existingMemory || "Core Long-Term Memory (Preserved from Day 1):\n- Conversation history active.",
    });
  }
});

// Multimodal Image-to-Text Transcoder Endpoint (Converts image to detailed text format for text-only LLMs)
app.post("/api/describe-image", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg", prompt, apiKey } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64 data." });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const defaultPrompt =
      "You are an expert AI Vision Transcoder. Transcribe and describe this image in thorough detail so a text-only language model can completely understand everything in it. Extract all text, code, numbers, tables, equations, formulas, diagrams, graphs, UI elements, objects, and visual details. Structure your description cleanly with clear headings or bullet points.";

    // Use vision API key from env or user input
    const geminiKey = apiKey || process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType || "image/jpeg",
                    data: cleanBase64,
                  },
                },
                { text: prompt || defaultPrompt },
              ],
            },
          ],
        });

        if (response.text) {
          return res.json({ description: response.text });
        }
      } catch (geminiErr: any) {
        console.error("Gemini Vision Transcoder error:", geminiErr);
      }
    }

    return res.json({
      description: `[Attached Image]: An image was attached (${mimeType}). Please ask the user for details or configure server GEMINI_API_KEY for automatic vision text extraction.`,
    });
  } catch (err: any) {
    console.error("Image describe error:", err);
    return res.status(500).json({ error: err.message || "Failed to analyze image." });
  }
});

function setupSSEResponse(res: express.Response) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof (res as any).flushHeaders === "function") {
    (res as any).flushHeaders();
  }
}

// Generate Optimized Search Query
async function generateOptimizedSearchQuery(messages: any[], currentDate: string): Promise<string> {
  try {
    const recentMsgs = messages.slice(-4).map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
    const prompt = `You are an expert search query optimizer. The user wants to search the web for real-time information to answer their latest query.
Current Date: ${currentDate}
Recent Conversation:
${recentMsgs}

  Generate the BEST single search engine query (2 to 7 keywords) to find the information the user is looking for.
  Do NOT answer the question. DO NOT use quotes. ONLY output the raw search query string. Focus on the core nouns and entities.`;

    const fetchBaseUrl = process.env.VITE_API_BASE_URL || "https://20128-a38e1a7f-5433-4195-806b-597ab96eab62.daytonaproxy01.eu/v1";
    const fetchApiKey = process.env.VITE_API_KEY || "sk-c3c3dcad25cf7393-98d439-998734cb";
    
    const response = await fetch(`${fetchBaseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${fetchApiKey}` },
      body: JSON.stringify({
        model: process.env.VITE_API_MODELS ? process.env.VITE_API_MODELS.split(',')[0] : "antigravity/gemini-3.6-flash-low",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 30,
        stream: false,
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content?.trim();
      if (text) return text.replace(/^["']|["']$/g, '');
    } else {
       // if not OK, we might be hitting a rate limit, fallback
       const err = await response.text();
       console.error("[Search Optimizer] Failed:", response.status, err);
    }
  } catch (e) {
    console.error("[Search Optimizer] Error:", e);
  }
  
  // Fallback to raw user message if LLM fails
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  return lastUser ? lastUser.content : "";
}

// Fast Web Search using remote Tavily API
async function performTavilySearch(query: string): Promise<string> {
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  if (!tavilyApiKey) {
    return "Web search is currently unavailable (TAVILY_API_KEY is not configured).";
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    console.log(`[Tavily] Search started for query: "${query}"`);
    
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tavilyApiKey}`
      },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        include_answer: false,
        include_images: false,
        include_raw_content: false,
        max_results: 5
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[Tavily] Failed with HTTP ${response.status}`);
      return "Web search is currently unavailable (Provider error).";
    }

    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) {
      console.error("[Tavily] Invalid JSON format received");
      return "Web search is currently unavailable (Invalid response).";
    }

    let resultsText = "Live Web Search Results:\n\n";
    let count = 0;

    for (const result of data.results) {
      const title = result.title?.trim();
      const snippet = result.content?.trim();
      const link = result.url || "";
      
      if (title && snippet) {
        resultsText += `${count + 1}. ${title}\n${snippet}\n(Source: ${link})\n\n`;
        count++;
      }
    }
    
    if (count > 0) {
      return resultsText;
    }

    return `[SYSTEM NOTE TO AI]: You executed the search query "${query}", but the search engine returned 0 results. Tell the user explicitly that you searched for "${query}" but your search provider returned no results.`;
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error("[Tavily] Error:", err.message);
    return "Web search is currently unavailable.";
  }
}

// --- GLOBAL ROUTING STATE ---
interface InstanceInfo {
  baseUrl: string;
  apiKey: string;
}
let activeModels: string[] = [];
let modelRoutingMap: Record<string, InstanceInfo> = {};
let isHealthCheckEnabled = process.env.VITE_ENABLE_MODEL_HEALTH_CHECK === "true";

// Chat completion streaming endpoint
app.post("/api/chat", async (req, res) => {
  try {
    let {
      provider = "openai",
      baseUrl = "",
      apiKey = "",
      model = "gpt-4o-mini",
      messages = [],
      systemPrompt = "",
      temperature = 0.7,
      maxTokens,
      webSearch,
    } = req.body;

    // Smart Multi-Endpoint Routing logic
    if (provider === "custom" && isHealthCheckEnabled && modelRoutingMap[model]) {
      const route = modelRoutingMap[model];
      baseUrl = route.baseUrl;
      apiKey = route.apiKey;
    }

    let augmentedSystemPrompt = systemPrompt || "";
    const currentDateTime = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full", timeStyle: "long" });
    augmentedSystemPrompt = `[System Info: Current Date and Time is ${currentDateTime}]\n\n` + augmentedSystemPrompt;

    if (webSearch && messages.length > 0) {
      try {
         const optimizedQuery = await generateOptimizedSearchQuery(messages, currentDateTime);
         if (optimizedQuery) {
           const searchResults = await performTavilySearch(optimizedQuery);
           augmentedSystemPrompt += "\n\nCRITICAL: Use the following LIVE WEB SEARCH RESULTS to answer the user's latest query accurately. Do not hallucinate. Cite sources if helpful.\n\n" + searchResults;
         }
      } catch (e) {
         console.error("Web search injection failed", e);
      }
    }

    // 1. Google Gemini via Official SDK or ENV key
    if (provider === "gemini" && (!baseUrl || baseUrl.includes("generativelanguage.googleapis.com"))) {
      const keyToUse = (apiKey && apiKey !== "ENV_KEY") ? apiKey : process.env.GEMINI_API_KEY;
      if (!keyToUse) {
        return res.status(400).json({ error: "Missing Gemini API key. Please enter a key or set GEMINI_API_KEY." });
      }

      const ai = new GoogleGenAI({ apiKey: keyToUse });
      const systemInstruction = augmentedSystemPrompt ? augmentedSystemPrompt : undefined;
      const modelName = model || "gemini-2.5-flash";

      // Transform messages into GenAI contents format
      const contents = messages
        .filter((m: any) => m.role === "user" || m.role === "assistant")
        .map((m: any) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content || "" }],
        }));

      setupSSEResponse(res);

      try {
        const resultStream = await ai.models.generateContentStream({
          model: modelName,
          contents,
          config: {
            systemInstruction,
            temperature: typeof temperature === "number" ? temperature : 0.7,
            maxOutputTokens: maxTokens ? Math.max(Number(maxTokens), 8192) : 8192,
          },
        });

        for await (const chunk of resultStream) {
          const text = chunk.text;
          if (text) {
            res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
          }
        }
        res.write("data: [DONE]\n\n");
        return res.end();
      } catch (streamErr: any) {
        res.write(`data: ${JSON.stringify({ error: streamErr.message || "Gemini streaming error" })}\n\n`);
        res.write("data: [DONE]\n\n");
        return res.end();
      }
    }

    // 2. Anthropic Format
    if (provider === "anthropic") {
      const cleanBase = normalizeBaseUrl(baseUrl || "https://api.anthropic.com/v1");
      const url = `${cleanBase}/messages`;

      const formattedMsgs = messages
        .filter((m: any) => m.role === "user" || m.role === "assistant")
        .map((m: any) => ({
          role: m.role,
          content: m.content,
        }));

      const bodyPayload: any = {
        model: model || "claude-3-5-sonnet-20241022",
        max_tokens: maxTokens ? Math.max(Number(maxTokens), 8192) : 8192,
        messages: formattedMsgs,
        stream: true,
        temperature: typeof temperature === "number" ? temperature : 0.7,
      };

      if (augmentedSystemPrompt) {
        bodyPayload.system = augmentedSystemPrompt;
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: `Anthropic API error (${response.status}): ${errorText}` });
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const errJson = await response.json();
        const parseMsg = errJson.error?.message || JSON.stringify(errJson);
        return res.status(503).json({ error: `Upstream API Error (Proxy JSON): ${parseMsg}` });
      }

      setupSSEResponse(res);

      if (!response.body) {
        return res.status(500).json({ error: "No response body received from Anthropic." });
      }

      const reader = (response.body as any).getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const dataStr = trimmed.slice(6);
            if (dataStr === "[DONE]") { res.write("data: [DONE]\n\n"); return res.end(); }
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                res.write(`data: ${JSON.stringify({ content: parsed.delta.text })}\n\n`);
              }
            } catch (e) {
              // ignore partial parse
            }
          }
        }
      }
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    let finalBaseUrl = baseUrl || "https://api.openai.com";
    let finalApiKey = apiKey;
    
    if (process.env.VITE_OPENROUTER_FREE_MODELS?.split(',').map(m => m.trim()).includes(model)) {
      finalBaseUrl = process.env.VITE_OPENROUTER_FREE_MODEL_BASE_URL || "https://openrouter.ai/api/v1";
      finalApiKey = process.env.VITE_OPENROUTER_FREE_MODEL_API_KEY || finalApiKey;
    }

    let endpointsToTry: Array<{baseUrl: string, apiKey: string}> = [];
    if (provider === "custom" && isHealthCheckEnabled) {
      if (modelRoutingMap[model]) {
        endpointsToTry.push(modelRoutingMap[model]);
      }
      endpointsToTry.push({ baseUrl: baseUrl || "", apiKey: apiKey || "" });
      endpointsToTry.push({ baseUrl: getDynamicEnv("VITE_OMNIROUTE_2_BASE_URL") || "", apiKey: getDynamicEnv("VITE_OMNIROUTE_2_API_KEY") || "" });
      
      // Deduplicate endpoints
      const uniqueUrls = new Set();
      endpointsToTry = endpointsToTry.filter(e => {
        const key = e.baseUrl + e.apiKey;
        if (!e.baseUrl || uniqueUrls.has(key)) return false;
        uniqueUrls.add(key);
        return true;
      });
    } else {
      endpointsToTry.push({ baseUrl: finalBaseUrl, apiKey: finalApiKey });
    }

    const formattedMessages = [...messages];
    console.log("AI REQUEST PAYLOAD:", { provider, model, webSearch, augmentedSystemPrompt: augmentedSystemPrompt.substring(0, 500) });
    if (augmentedSystemPrompt) {
      const existingSystemIndex = formattedMessages.findIndex((m: any) => m.role === "system");
      if (existingSystemIndex !== -1) {
        formattedMessages[existingSystemIndex].content = augmentedSystemPrompt + "\n\n" + formattedMessages[existingSystemIndex].content;
      } else {
        formattedMessages.unshift({ role: "system", content: augmentedSystemPrompt });
      }
    }

    const payload: any = {
      model: model || "gpt-4o-mini",
      messages: formattedMessages,
      stream: true,
      temperature: typeof temperature === "number" ? temperature : 0.7,
    };
    if (maxTokens) {
      payload.max_tokens = Math.max(Number(maxTokens), 16384);
    } else {
      payload.max_tokens = 16384;
    }

    let lastErrorResponseStatus = 500;
    let lastErrorParseMsg = "All fallback endpoints failed.";

    for (const endpoint of endpointsToTry) {
      const targetUrl = getOpenAICompletionsUrl(endpoint.baseUrl);
      
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (endpoint.apiKey) {
        headers["Authorization"] = `Bearer ${endpoint.apiKey}`;
      }
      if (provider === "openrouter") {
        headers["HTTP-Referer"] = "https://ai.studio";
        headers["X-Title"] = "Universal Chatbot";
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutes timeout

      try {
        const response = await fetch(targetUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          let parseMsg = errorText;
          try {
            const parsed = JSON.parse(errorText);
            if (parsed.error?.message) parseMsg = parsed.error.message;
          } catch (e) {
            if (errorText.toLowerCase().includes("<html") || errorText.toLowerCase().includes("<!doctype")) {
              parseMsg = "The upstream server returned an HTML error page (it may be down or unreachable).";
            }
          }
          lastErrorResponseStatus = response.status;
          lastErrorParseMsg = parseMsg;
          console.warn(`[Fallback] ${model} failed on ${endpoint.baseUrl} with ${response.status}: ${parseMsg}`);
          continue; // TRY NEXT ENDPOINT
        }

        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const errJson = await response.json();
          const parseMsg = errJson.error?.message || JSON.stringify(errJson);
          lastErrorResponseStatus = 503;
          lastErrorParseMsg = parseMsg;
          console.warn(`[Fallback] ${model} Proxy JSON error on ${endpoint.baseUrl}: ${parseMsg}`);
          continue; // TRY NEXT ENDPOINT
        }

        setupSSEResponse(res);

        if (!response.body) {
          return res.status(500).json({ error: "No response body received from upstream API." });
        }

        const reader = (response.body as any).getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(":")) continue;

            if (trimmed.startsWith("data: ")) {
              const dataStr = trimmed.slice(6).trim();
              if (dataStr === "[DONE]") {
                res.write("data: [DONE]\n\n");
                continue;
              }
              try {
                const parsed = JSON.parse(dataStr);
                // Check if upstream sent an error in the stream
                if (parsed.error) {
                  res.write(`data: ${JSON.stringify({ content: `\n\n[API Error: ${parsed.error.message || JSON.stringify(parsed.error)}]` })}\n\n`);
                  continue;
                }
                const content =
                  parsed.choices?.[0]?.delta?.content ||
                  parsed.choices?.[0]?.text ||
                  "";
                if (content) {
                  res.write(`data: ${JSON.stringify({ content })}\n\n`);
                }
              } catch (e) {
                // Ignore JSON parse chunk boundary issues
              }
            }
          }
        }

        res.write("data: [DONE]\n\n");
        return res.end();
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        lastErrorResponseStatus = 500;
        lastErrorParseMsg = fetchErr.message;
        console.warn(`[Fallback] Exception for ${model} on ${endpoint.baseUrl}: ${fetchErr.message}`);
        continue; // TRY NEXT ENDPOINT
      }
    }
    
    // If we exit the loop, all endpoints failed
    console.error(`[Fallback] ALL endpoints failed for ${model}. Last error: ${lastErrorParseMsg}`);
    
    if (!res.headersSent) {
      return res.status(lastErrorResponseStatus).json({ error: `Upstream API Error (${lastErrorResponseStatus}): ${lastErrorParseMsg}` });
    } else {
      res.write(`data: ${JSON.stringify({ error: `Stream interrupted: ${lastErrorParseMsg}` })}\n\n`);
      res.write("data: [DONE]\n\n");
      return res.end();
    }

  } catch (err: any) {
    console.error("Chat API Error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err?.message || "Internal server error" });
    } else {
      res.write(`data: ${JSON.stringify({ error: err?.message || "Stream interrupted" })}\n\n`);
      res.write("data: [DONE]\n\n");
      return res.end();
    }
  }
});

async function startServer() {
  // Shadow Evaluation Endpoint (Layer 4 Auto-Prompt Optimization)
  app.post("/api/shadow-evaluate", async (req, res) => {
    console.log("[Server] /api/shadow-evaluate triggered! Background Evolution is running...");
    try {
      const { provider, baseUrl, apiKey, model, historyText } = req.body;

      const evalPrompt = `You are a strict, highly analytical AI Evaluator. Your job is to shadow-evaluate the following chat logs between a User and an AI Assistant.
      
      Look for recurring patterns, friction points, and preferences:
      1. Did the User complain about length, tone, or style?
      2. What does the User prefer? (e.g., concise answers, specific coding styles, directness).
      3. Are there any conversational bad habits the Assistant should avoid?

      Based on your analysis, generate a "Global Shadow Evaluation Persona". 
      This must be a concise, powerful set of behavioral rules that will be injected into the Assistant's system prompt for ALL future chats.
      
      IMPORTANT: If the chat logs are too short, generic (like just saying "hello"), or do not contain enough meaningful interactions to determine the user's preferences, you MUST output exactly the word "NO_CHANGE" and nothing else. DO NOT hallucinate rules.

      Format your response purely as the new rule set. Do NOT include pleasantries, explanations, or quotes from the chat. Just the rules.
      Example format:
      - Always respond in under 5 sentences unless asked for a tutorial.
      - Never use Tailwind CSS, strictly use vanilla CSS.
      - Never apologize.

      Recent Conversation Logs:
      ${historyText || "No prior history."}`;

      try {
        const userModels = getDynamicEnv("VITE_MEMORY_SUMMARIZER_MODEL") || "antigravity/gemini-3.6-flash-low";
        const modelsString = `${userModels},antigravity/gemini-3.6-flash-low`;
        
        const optimizedRules = await executeBackgroundLLM(modelsString, evalPrompt, 1000);
        
        console.log("[Server] Shadow Evaluation completed. Generated Rules:", optimizedRules);
        res.json({ rules: optimizedRules });
      } catch (err: any) {
        console.error("[Shadow Evaluate] LLM fetch error:", err);
        res.status(500).json({ error: "Failed to generate evaluation rules." });
      }
    } catch (e: any) {
      console.error("[Shadow Evaluate] Global error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // --- MODEL HEALTH CHECK LOGIC ---
  async function pingModel(modelName: string, baseUrl: string, apiKey: string): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!response.ok) {
        console.error(`[HealthCheck] ${modelName} on ${baseUrl} failed with status ${response.status}`);
      }
      return response.ok;
    } catch (e: any) {
      clearTimeout(timeout);
      console.error(`[HealthCheck] ${modelName} on ${baseUrl} exception:`, e.message);
      return false;
    }
  }

  async function runModelHealthCheck() {
    isHealthCheckEnabled = process.env.VITE_ENABLE_MODEL_HEALTH_CHECK === "true";
    if (!isHealthCheckEnabled) return;

    const instance1 = {
      baseUrl: process.env.VITE_API_BASE_URL || "",
      apiKey: process.env.VITE_API_KEY || ""
    };
    const instance2 = {
      baseUrl: process.env.VITE_OMNIROUTE_2_BASE_URL || "",
      apiKey: process.env.VITE_OMNIROUTE_2_API_KEY || ""
    };

    const allModelsString = getDynamicEnv("VITE_API_MODELS") || "antigravity/gemini-3.6-flash-low,oc/big-pickle,oc/deepseek-v4-flash-free";
    const allModels = Array.from(new Set(allModelsString.split(",").map(m => m.trim()).filter(Boolean)));
    
    console.log(`[HealthCheck] Pinging ${allModels.length} models across 2 endpoints sequentially...`);
    
    const newMap: Record<string, InstanceInfo> = {};
    const newActive: string[] = [];

    for (const model of allModels) {
      let found = false;
      if (instance1.baseUrl && instance1.apiKey) {
        const isAlive1 = await pingModel(model, instance1.baseUrl, instance1.apiKey);
        if (isAlive1) {
          newMap[model] = instance1;
          newActive.push(model);
          found = true;
        }
      }
      
      if (!found && instance2.baseUrl && instance2.apiKey) {
        const isAlive2 = await pingModel(model, instance2.baseUrl, instance2.apiKey);
        if (isAlive2) {
          newMap[model] = instance2;
          newActive.push(model);
        }
      }
    }

    modelRoutingMap = newMap;
    activeModels = newActive;
    console.log(`[HealthCheck] Active models updated: ${activeModels.join(", ")}`);
  }

  // Run immediately on start if enabled
  runModelHealthCheck();
  // Run periodically every 3 minutes
  setInterval(runModelHealthCheck, 3 * 60 * 1000); 

  // Watch .env file for dynamic updates and trigger health check instantly
  if (fs.existsSync(".env")) {
    let debounceTimer: any = null;
    fs.watch(".env", (eventType) => {
      if (eventType === "change") {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          console.log("[Server] .env changed! Reloading env vars and triggering instant health check...");
          deduplicateEnvFile(); // Deduplicate directly inside the file if needed
          try {
            const envConfig = dotenv.parse(fs.readFileSync('.env'));
            for (const k in envConfig) {
              process.env[k] = envConfig[k];
            }
          } catch (e) {
            console.error("[Server] Error parsing .env during reload:", e);
          }
          runModelHealthCheck();
        }, 1000);
      }
    });
  }

  app.get("/api/active-models", (req, res) => {
    isHealthCheckEnabled = process.env.VITE_ENABLE_MODEL_HEALTH_CHECK === "true";
    const allModelsString = getDynamicEnv("VITE_API_MODELS") || "antigravity/gemini-3.6-flash-low,oc/big-pickle,oc/deepseek-v4-flash-free";
    const allModels = Array.from(new Set(allModelsString.split(",").map((m: string) => m.trim()).filter(Boolean)));
    
    res.json({
      isEnabled: isHealthCheckEnabled,
      activeModels,
      allModels
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }



  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

