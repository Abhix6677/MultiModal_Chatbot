import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import * as cheerio from 'cheerio';
import fs from "fs";
import { buildContext, updateOrAddMemory, getUserMemories, retrieveRelevantMemories, isUserFactQuery } from "./backendMemory";
import {
  loadBehaviorModel,
  saveBehaviorModel,
  applyEvolutionDecision,
  rollbackLastEvolution,
  promoteExperimentalRule,
  rejectExperimentalRule,
  deleteRule,
  pauseEvolution,
  resumeEvolution,
  isEvolutionPaused,
  migrateFromGlobalSystemRules,
  getActiveRulesForPrompt,
  tickTemporaryRules,
  type EvaluatorResult,
} from "./backendEvolution";
import { 
  getUserConversations, 
  saveUserConversations, 
  saveOrUpdateConversation, 
  deleteConversation, 
  clearUserConversations 
} from "./backendConversations";


// ============================================================
// DISK MEMORY STORAGE — data/memories/<convId>.json
// Persists each conversation's condensed memory & watermark
// across server restarts forever.
// ============================================================
const MEMORY_DIR = path.join(process.cwd(), "data", "memories");

function ensureMemoryDir() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

interface ConvMemoryFile {
  convId: string;
  lastSummarizedIndex: number;
  longTermMemory: string;
  updatedAt: string;
}

function saveMemoryToDisk(convId: string, memory: string, lastSummarizedIndex: number) {
  try {
    ensureMemoryDir();
    const file: ConvMemoryFile = {
      convId,
      lastSummarizedIndex,
      longTermMemory: memory,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(MEMORY_DIR, `${convId}.json`), JSON.stringify(file, null, 2), "utf-8");
    console.log(`[Memory] Saved to disk: ${convId}.json (watermark=${lastSummarizedIndex})`);
  } catch (e) {
    console.error("[Memory] Failed to save memory to disk:", e);
  }
}

function loadMemoryFromDisk(convId: string): ConvMemoryFile | null {
  try {
    const filepath = path.join(MEMORY_DIR, `${convId}.json`);
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, "utf-8")) as ConvMemoryFile;
    }
  } catch (e) {
    console.error("[Memory] Failed to load memory from disk:", e);
  }
  return null;
}

function deleteMemoryFromDisk(convId: string) {
  try {
    const filepath = path.join(MEMORY_DIR, `${convId}.json`);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      console.log(`[Memory] Deleted disk file: ${convId}.json`);
    }
  } catch (e) {
    console.error("[Memory] Failed to delete memory from disk:", e);
  }
}

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

// Circuit breaker to avoid repeatedly waiting 8 seconds on dead proxy endpoints during a map-reduce loop
const deadEndpoints: Record<string, number> = {};
const deadModelEndpoints: Record<string, number> = {};

// Memory Summarizer Endpoint
async function executeBackgroundLLM(modelsString: string, prompt: string, maxTokens: number = 4096): Promise<string> {
  const configuredModels = modelsString.split(',').map(m => m.trim()).filter(Boolean);
  // Preserving order: Try configured summarizer models first, then activeModels fallback
  const models = Array.from(new Set([...configuredModels, ...activeModels]));
  
  let lastError = null;

  for (const model of models) {
    const endpointsToTry: Array<{baseUrl: string, apiKey: string}> = [];

    if (modelRoutingMap[model]) {
      endpointsToTry.push(modelRoutingMap[model]);
    }
    endpointsToTry.push({ baseUrl: process.env.VITE_API_BASE_URL || "", apiKey: process.env.VITE_API_KEY || "" });
    endpointsToTry.push({ baseUrl: process.env.VITE_OMNIROUTE_2_BASE_URL || "", apiKey: process.env.VITE_OMNIROUTE_2_API_KEY || "" });

    // Deduplicate endpoints
    const uniqueUrls = new Set();
    const cleanEndpoints = endpointsToTry.filter(e => {
      const key = e.baseUrl + e.apiKey;
      if (!e.baseUrl || uniqueUrls.has(key)) return false;
      uniqueUrls.add(key);
      return true;
    });

    let contextWindowExceeded = false;

    for (const endpoint of cleanEndpoints) {
      if (deadEndpoints[endpoint.baseUrl] && deadEndpoints[endpoint.baseUrl] > Date.now()) {
        console.log(`[Background LLM] Skipping ${endpoint.baseUrl} (Circuit Breaker Active)`);
        continue;
      }

      try {
        console.log(`[Background LLM] Attempting model "${model}" on endpoint "${endpoint.baseUrl}"...`);
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
          signal: AbortSignal.timeout(90000) // 90 seconds timeout (free models can be very slow)
        });

        if (!response.ok) {
          const errText = await response.text();
          const errLower = errText.toLowerCase();

          // Auto-detect context length exceeded errors and immediately switch to next candidate model
          if (
            response.status === 400 && 
            (errLower.includes("context") || errLower.includes("token") || errLower.includes("maximum") || errLower.includes("too long"))
          ) {
            console.warn(`[Background LLM] ${model} context window exceeded (400). Switching to next candidate model...`);
            contextWindowExceeded = true;
            lastError = new Error(`[Background LLM] ${model} context length exceeded: ${errText}`);
            break; // Break endpoint loop to try NEXT model in list
          }

          lastError = new Error(`[Background LLM] ${model} on ${endpoint.baseUrl} failed: ${response.status} - ${errText}`);
          console.warn(lastError.message);
          continue;
        }

        const rawText = await response.text();
        try {
          const data = JSON.parse(rawText);
          if (data.choices && data.choices[0] && data.choices[0].message?.content) {
            console.log(`[Background LLM] SUCCESS with model "${model}"!`);
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
          if (extractedText) {
            console.log(`[Background LLM] SUCCESS (SSE) with model "${model}"!`);
            return extractedText.trim();
          }
        }
      } catch (e: any) {
        lastError = e;
        if (e.message?.toLowerCase().includes("timeout") || e.name === "TimeoutError") {
          console.warn(`[Background LLM] ${endpoint.baseUrl} timed out! Activating circuit breaker for 60 seconds.`);
          deadEndpoints[endpoint.baseUrl] = Date.now() + 60000;
        } else {
          console.warn(`[Background LLM] ${model} fetch exception on ${endpoint.baseUrl}:`, e.message);
        }
        continue;
      }
    }

    if (contextWindowExceeded) {
      console.log(`[Background LLM] Switched away from ${model} due to context limit. Trying next model...`);
    }
  }
  
  // Ultimate Fallback: If all OpenAI-compatible endpoints failed, try direct Gemini API
  if (process.env.GEMINI_API_KEY) {
    try {
      console.log(`[Background LLM] All proxy models failed. Falling back to direct Gemini API (gemini-2.5-flash)...`);
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      // We can't pass AbortSignal directly to generateContent easily, but we can race it
      const response = await Promise.race([
        ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            temperature: 0.3,
            maxOutputTokens: maxTokens
          }
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Gemini API Timeout")), 90000))
      ]) as any;

      if (response.text) {
        console.log(`[Background LLM] SUCCESS with ultimate fallback (gemini-2.5-flash)!`);
        return response.text.trim();
      }
    } catch (geminiErr: any) {
      console.warn(`[Background LLM] Ultimate Gemini fallback also failed:`, geminiErr.message);
      lastError = geminiErr;
    }
  }

  throw lastError || new Error("All fallback models failed.");
}

app.post("/api/summarize-memory", async (req, res) => {
  try {
    const { provider, baseUrl, apiKey, model, historyText, existingMemory, convId, lastSummarizedIndex, isGlobal, userId = "default_user" } = req.body;

    const memoryPrompt = `Analyze the following chat conversation history.
Task 1: Update the ongoing CONVERSATIONAL SUMMARY (a concise narrative of what is being discussed, current status, and context). It should incorporate the existing summary if provided.
Task 2: Extract any DURABLE FACTS about the user. Durable facts include:
- User's name or nickname (e.g. "My name is Abhishek", "Call me Avi")
- Educational details (CGPA, degree, university) (e.g. "My CGPA is 9.10")
- Projects they are working on or renamed (e.g. "I started SkyHost", "TitanCloud replaces SkyHost")
- Technologies or skills they declare they prefer/use
- Personal preferences (e.g., "I prefer Python")

CRITICAL CONSTRAINTS FOR FACTS:
1. ONLY extract facts that the USER affirmatively declares about themselves.
2. NEVER extract facts from ASSISTANT responses.
3. NEVER treat USER QUESTIONS or queries (e.g. "What is my current project?", "What was my previous project?") as new fact declarations. If the user only asks questions, output an empty facts array.
4. If the user explicitly corrects or replaces a previous fact, extract the NEW fact with the appropriate entity_key.

Output EXACTLY a JSON object with this schema:
{
  "summary": "The updated concise conversational summary...",
  "facts": [
    { 
      "content": "The fact clearly stated", 
      "category": "identity|education|project|skill|preference|goal|other",
      "entity_key": "A stable logical key for this fact, e.g. education.cgpa, identity.name, project.current, preference.language. This will be used to replace old facts."
    }
  ]
}

Do NOT output anything else. ONLY valid JSON.
Existing Summary: ${existingMemory || "None"}

Conversation History:
${historyText}`;

    try {
      const userModelsString = getDynamicEnv("VITE_MEMORY_SUMMARIZER_MODEL") || "mistral/glm-5-2,mistral/mistral-small-latest,antigravity/gemini-3.6-flash-low,mistral/mistral-large-latest";
      const userConfiguredModels = userModelsString.split(",").map(m => m.trim()).filter(Boolean);

      const candidates = Array.from(new Set([
        ...userConfiguredModels,
        model,
        ...activeModels,
        "antigravity/gemini-3.6-flash-low"
      ])).filter(Boolean);

      let memoryText = await executeBackgroundLLM(candidates.join(","), memoryPrompt, 4096);
      
      // Attempt to parse JSON
      let parsedData: { summary?: string, facts?: any[] } = {};
      try {
        const jsonMatch = memoryText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedData = JSON.parse(jsonMatch[0]);
        } else {
          parsedData = JSON.parse(memoryText);
        }
      } catch (e) {
        console.error("[Memory Write Pipeline] Failed to parse JSON from LLM. Raw:", memoryText);
      }

      if (parsedData.facts && Array.isArray(parsedData.facts)) {
        for (const fact of parsedData.facts) {
          if (fact.content && fact.category) {
            // Check if the LLM provided an entity_key, if not we try to heuristically generate one based on content
            let key = fact.entity_key;
            
            updateOrAddMemory(userId, fact.content, fact.category, convId || 'unknown', [], 3, key);
            console.log(`[MEMORY SAVED] User: ${userId} | Category: ${fact.category} | Key: ${key} | Fact: ${fact.content}`);
          }
        }
      }

      // Restore returning the conversational summary to the frontend!
      const finalSummary = parsedData.summary || existingMemory || "Conversation summarized.";
      return res.json({ memory: finalSummary, success: true });
    } catch (e: any) {
      console.error("[Memory] ALL models failed to summarize:", e.message);
      // STRICT: Return failed flag — NO dummy fallback content.
      // Frontend will NOT advance the watermark and will retry next time.
      return res.status(503).json({
        failed: true,
        error: `[Memory Error] All summarization models are unavailable. Memory extraction postponed. Will auto-retry when a model is reachable. (${e.message})`,
      });
    }
  } catch (err: any) {
    return res.status(500).json({
      failed: true,
      error: `[Memory Error] Internal server error: ${err.message}`,
    });
  }
});

// ============================================================
// CONVERSATION HISTORY REST ENDPOINTS
// Persists user conversations to data/users/<userId>/conversations.json
// ============================================================
app.get("/api/conversations", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  try {
    const userId = (req.query.userId as string) || "default_user";
    const conversations = getUserConversations(userId);
    return res.json({ ok: true, conversations });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/conversations", (req, res) => {
  try {
    const { userId = "default_user", conversation, conversations } = req.body;
    if (conversation) {
      const saved = saveOrUpdateConversation(userId, conversation);
      return res.json({ ok: true, conversation: saved });
    } else if (Array.isArray(conversations)) {
      saveUserConversations(userId, conversations);
      return res.json({ ok: true, count: conversations.length });
    }
    return res.status(400).json({ ok: false, error: "Missing conversation or conversations array." });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/conversations/:id", (req, res) => {
  try {
    const userId = (req.query.userId as string) || (req.body?.userId as string) || "default_user";
    const { id } = req.params;
    const deleted = deleteConversation(userId, id);
    return res.json({ ok: true, deleted });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/conversations", (req, res) => {
  try {
    const userId = (req.query.userId as string) || (req.body?.userId as string) || "default_user";
    clearUserConversations(userId);
    return res.json({ ok: true, cleared: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Background automatic turn-based memory extractor
async function extractDurableFactsFromTurn(
  userId: string,
  conversationId: string,
  userMessage: string
) {
  if (!userMessage || userMessage.trim().length < 3) return;

  // Strict Question & Inquiry Guard: Queries must NEVER mutate user memory
  if (isUserFactQuery(userMessage)) {
    console.log(`[Memory Extractor] Ignored user query/inquiry: "${userMessage.substring(0, 80)}"`);
    return;
  }

  const msgTrimmed = userMessage.trim();
  // Generic trigger: Must contain a personal pronoun or identity keyword, AND a factual verb
  const hasSubject = /\b(my|i|me|mine|our|we|name|address|call|know|person|goes by)\b/i.test(msgTrimmed);
  const hasAction = /\b(is|am|are|was|were|use|prefer|start|build|work|go|call|address|know)\b/i.test(msgTrimmed);
  const containsFactDeclaration = hasSubject && hasAction && msgTrimmed.length > 5;

  if (!containsFactDeclaration) {
    return;
  }

  const existingMemories = getUserMemories(userId);
  const existingActive = existingMemories.filter(m => m.status === 'active');
  const existingActiveSummary = existingActive.length > 0
    ? existingActive.map(m => `- ID: ${m.id} | Key: ${m.entity_key || 'none'} | Category: ${m.category} | Fact: ${m.content}`).join('\n')
    : "No existing memories yet.";

  const prompt = `Analyze the following message sent by a user to an AI. Extract any PERSISTENT DURABLE FACTS about the user.
Durable facts include:
- Projects, apps, tools they are building, renamed, or working on ("I started NovaHost", "NovaHost is now called EdgeHost", "My project is TitanCloud. This replaces SkyHost.")
- Programming languages, editors, frameworks, preferences ("My editor is VS Code", "I switched to Cursor", "I now prefer Python")
- Identity (name, nickname, role, location, bio)
- Education details (CGPA, degree, college)
- Third-party relationships (friends, family, colleagues, pets)

CRITICAL IDENTITY RULES:
- A person's name is NOT the user's name unless the source text explicitly establishes that the user refers to themselves by that name.
- User identity: "My name is Abhix." -> entity_key: "current_name"
- Third-party relationships: "My friend is Mia." -> entity_key: "friend.name"
- Objects/entities: "My dog's name is Bruno." -> entity_key: "pet.name"

IMPORTANT: If the user is ASKING A QUESTION (e.g. "What was my previous project?", "Give me my project history", "What is my current CGPA?"), output []. Do NOT treat user questions as new facts.


EXISTING ACTIVE USER MEMORIES:
${existingActiveSummary}

RULES FOR UPDATES / RENAMING / CORRECTIONS:
1. If the user is renaming, updating, replacing, or correcting an existing fact (e.g. "NovaHost is now called EdgeHost", "TitanCloud replaces SkyHost", "I switched from Java to Python", "My CGPA is now 9.10"):
   - Put the old memory ID in "supersede_ids": ["mem_..."]
   - Assign a matching "entity_key" (e.g. "project.current", "preference.language", "education.cgpa")
2. If it is a completely new fact, "supersede_ids" should be [].

Output a JSON array of objects with the following schema:
[
  {
    "content": "Clear, concise fact statement (e.g. User's current project is TitanCloud)",
    "category": "identity|education|project|skill|preference|goal|relationships|other",
    "entity_key": "Stable dot-notated key e.g. project.current, preference.language, education.cgpa, identity.name, cousin.name",
    "subject": "The primary subject of this fact (e.g. 'user', 'third_party', 'organization', 'project', 'object', 'unknown')",
    "ownership": "Who owns this property? Must be one of: 'user', 'third_party', 'organization', 'project', 'object', 'unknown'",
    "supersede_ids": ["array of exact old memory IDs to supersede, if this replaces/renames an old fact"]
  }
]
ALL fields (including subject and ownership) are strictly REQUIRED for every object.

If NO durable user facts are declared in the user message, output [].
Do NOT output any markdown, explanations, or extra text. Output ONLY valid JSON.

User Message:
${userMessage}`;

  try {
    const userModelsString = getDynamicEnv("VITE_MEMORY_SUMMARIZER_MODEL") || "mistral/glm-5-2,mistral/mistral-small-latest,antigravity/gemini-3.6-flash-low";
    const candidates = Array.from(new Set([
      ...userModelsString.split(",").map(m => m.trim()).filter(Boolean),
      ...activeModels,
      "antigravity/gemini-3.6-flash-low",
    ])).filter(Boolean);

    const memoryText = await executeBackgroundLLM(candidates.join(","), prompt, 1024);
    let parsedFacts: any[] = [];
    try {
      const jsonMatch = memoryText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsedFacts = JSON.parse(jsonMatch[0]);
      } else {
        parsedFacts = JSON.parse(memoryText);
      }
    } catch (e) {}

    if (Array.isArray(parsedFacts)) {
      for (const fact of parsedFacts) {
        if (fact.content && fact.category) {
          // GUARD: Reject contaminated multi-value extractions (e.g. "SkyHost, TitanCloud, AlphaTest")
          const contentStr = String(fact.content).trim();
          if (contentStr.includes('→') || contentStr.includes('->')) {
            console.log(`[BACKGROUND AUTO-MEMORY] REJECTED chain-format content: "${contentStr.substring(0, 80)}"`);
            continue;
          }
          if (contentStr.includes(',') && contentStr.split(',').length > 2) {
            console.log(`[BACKGROUND AUTO-MEMORY] REJECTED multi-value list: "${contentStr.substring(0, 80)}"`);
            continue;
          }
          if (/\bhistory\b|\btimeline\b|\boldest to newest\b|\bfrom oldest\b/i.test(contentStr)) {
            console.log(`[BACKGROUND AUTO-MEMORY] REJECTED history-query extraction: "${contentStr.substring(0, 80)}"`);
            continue;
          }

          const supersedeList = Array.isArray(fact.supersede_ids) ? fact.supersede_ids : [];
          updateOrAddMemory(userId, fact.content, fact.category, conversationId, supersedeList, 4, fact.entity_key, undefined, fact.subject, fact.ownership);
          console.log(`[BACKGROUND AUTO-MEMORY] Saved for ${userId} [${fact.entity_key || fact.category}]: ${fact.content} | Superseded: ${JSON.stringify(supersedeList)} | Ownership: ${fact.ownership}`);
        }
      }
    }
  } catch (err: any) {
    console.warn(`[Background Auto-Memory] Extraction failed: ${err.message}`);
  }
}

// Memory Inspection / Debug Endpoint
app.get("/api/debug/memory", (req, res) => {
  const userId = (req.query.userId as string) || "default_user";
  const memories = getUserMemories(userId);
  const activeMemories = memories.filter(m => m.status === "active");
  const supersededMemories = memories.filter(m => m.status === "superseded");
  return res.json({
    userId,
    activeCount: activeMemories.length,
    supersededCount: supersededMemories.length,
    activeMemories,
    supersededMemories
  });
});

// Clears a conversation's memory file from disk (called when user clicks "Clear Memory")
app.post("/api/migrate-memory", async (req, res) => {
  try {
    const { userId = "default_user", globalMemory } = req.body;
    if (!globalMemory || typeof globalMemory !== 'string') {
      return res.json({ success: true, message: "No legacy memory to migrate." });
    }

    // Attempt to convert the plain text globalMemory into structured JSON facts
    const migrationPrompt = `The following is an old plain-text memory profile of a user. Convert this into a structured JSON array of durable facts.
Schema:
[
  { "content": "The fact clearly stated", "category": "identity|education|project|skill|preference|goal|other" }
]

Old Memory:
${globalMemory}

Return ONLY valid JSON array.`;

    const memoryText = await executeBackgroundLLM("mistral/mistral-large-latest,gpt-4o-mini", migrationPrompt, 4096);
    
    let parsedFacts: any[] = [];
    try {
      const jsonMatch = memoryText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsedFacts = JSON.parse(jsonMatch[0]);
      } else {
        parsedFacts = JSON.parse(memoryText);
      }
    } catch (e) {
      console.error("[Migration] Failed to parse JSON. Raw:", memoryText);
      // Fallback: just store the whole block as 'other'
      parsedFacts = [{ content: globalMemory, category: "other" }];
    }

    if (parsedFacts && Array.isArray(parsedFacts)) {
      for (const fact of parsedFacts) {
        if (fact.content && fact.category) {
          updateOrAddMemory(userId, fact.content, fact.category, 'migration');
        }
      }
    }

    return res.json({ success: true, message: "Migration complete." });
  } catch (e: any) {
    console.error("[Migration Error]", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/clear-memory-file", (req, res) => {
  const { convId } = req.body;
  if (!convId) return res.status(400).json({ error: "convId is required." });
  deleteMemoryFromDisk(convId);
  return res.json({ ok: true, message: `Memory file for ${convId} deleted from disk.` });
});

// Loads the persisted memory & watermark from disk for a given conversation
app.get("/api/load-memory-file/:convId", (req, res) => {
  const { convId } = req.params;
  if (!convId) return res.status(400).json({ error: "convId is required." });
  const data = loadMemoryFromDisk(convId);
  if (data) {
    return res.json(data);
  }
  return res.json({ convId, lastSummarizedIndex: 0, longTermMemory: "", updatedAt: null });
});

// ============================================================
// GLOBAL USER PROFILE EXTRACTION
// Extracts personal identity facts (name, language, projects, preferences)
// from any conversation. Result is stored globally and injected into ALL chats.
// ============================================================
app.post("/api/extract-user-profile", async (req, res) => {
  try {
    const { provider, baseUrl, apiKey, model, historyText, existingProfile } = req.body;

    const profilePrompt = `You are a Personal Profile Extractor. Analyze this conversation and extract ONLY the user's PERSONAL IDENTITY FACTS that should be remembered permanently.

EXTRACT THESE FACTS (if mentioned):
1. User's real name (if told to the AI)
2. User's primary language (e.g., Hindi, English, Hinglish)
3. User's ongoing projects (apps, websites, coding projects they are building)
4. User's skills & background (student, developer, field of study)
5. User's preferences (e.g., prefers concise answers, no code comments, etc.)
6. User's location or timezone (if mentioned)
7. Any explicit personal facts the user shared about themselves

STRICT RULES:
- ONLY extract facts the USER explicitly shared about themselves
- DO NOT invent or assume anything
- DO NOT include conversation topics or AI responses
- If nothing new is found, return the EXISTING PROFILE unchanged
- Keep output SHORT and bullet-pointed

Existing Profile:
${existingProfile || "None yet."}

Conversation to analyze:
${historyText}

Output the UPDATED profile as clean bullet points under these headings:
### 👤 User Identity & Personal Facts
- (bullet points here)`;

    const userModelsString = getDynamicEnv("VITE_MEMORY_SUMMARIZER_MODEL") || "mistral/glm-5-2,mistral/mistral-small-latest,antigravity/gemini-3.6-flash-low";
    const candidates = Array.from(new Set([
      ...userModelsString.split(",").map(m => m.trim()).filter(Boolean),
      model,
      ...activeModels,
      "antigravity/gemini-3.6-flash-low",
    ])).filter(Boolean);

    try {
      const profileText = await executeBackgroundLLM(candidates.join(","), profilePrompt, 1024);
      return res.json({ profile: profileText });
    } catch (e: any) {
      console.error("[UserProfile] All models failed:", e.message);
      return res.status(503).json({ failed: true, error: e.message });
    }
  } catch (err: any) {
    return res.status(500).json({ failed: true, error: err.message });
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

function isVisionModel(model: string): boolean {
  if (!model) return false;
  const lower = model.toLowerCase();
  
  // The Llama 3.2 Vision proxy endpoints often fail with base64 image_url arrays 
  // or have strict 1-image limits that bug out. We force them through the transcoder.
  if (lower.includes('llama')) return false; 
  
  if (lower.includes('vision') || lower.includes('vl') || lower.includes('pixtral')) return true;
  if (lower.includes('gpt-4o')) return true;
  if (lower.includes('claude-3-5-sonnet') || lower.includes('claude-3-opus') || lower.includes('claude-3-haiku') || lower.includes('claude-3-7-sonnet')) return true;
  if (lower.includes('gemini-1.5') || lower.includes('gemini-2.0') || lower.includes('gemini-2.5')) return true;
  if (lower.includes('llava')) return true;
  return false;
}

async function transcribeImage(base64Data: string, mimeType: string): Promise<string> {
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const defaultPrompt = "Extract all visible text, exact URLs, repo names, code blocks, and key visual details comprehensively but concisely.";
  
  const geminiKey = getDynamicEnv("GEMINI_API_KEY") || process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: mimeType || "image/jpeg", data: cleanBase64 } },
            { text: defaultPrompt },
          ],
        }],
      });
      if (response.text) return response.text;
    } catch (geminiErr: any) {
      console.error("Gemini Vision Transcoder error:", geminiErr);
    }
  }
  return `[Attached Image]: An image was attached (${mimeType}). Please ask the user for details or configure server GEMINI_API_KEY for automatic vision text extraction.`;
}

function setupSSEResponse(res: express.Response) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof (res as any).flushHeaders === "function") {
    (res as any).flushHeaders();
  }
}

// Helper to safely extract text from string or multimodal array payloads
function extractMessageText(m: any): string {
  if (!m || !m.content) return "";
  if (typeof m.content === "string") return m.content;
  if (Array.isArray(m.content)) {
    return m.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join(" ");
  }
  return "";
}

// Generate Optimized Search Query
async function generateOptimizedSearchQuery(messages: any[], currentDate: string): Promise<string> {
  try {
    const recentMsgs = messages.slice(-4).map(m => `${m.role.toUpperCase()}: ${extractMessageText(m)}`).join("\n");
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
  return lastUser ? extractMessageText(lastUser) : "";
}

// --- IN-MEMORY URL CACHE FOR JINA & TAVILY SEARCH ---
interface CachedUrlData {
  content: string;
  timestamp: number;
}
const urlCache = new Map<string, CachedUrlData>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Helper to fetch clean markdown text via r.jina.ai for a given URL, with fallback to Tavily snippet
async function fetchJinaCleanedContent(url: string, tavilySnippet: string): Promise<string> {
  const cached = urlCache.get(url);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    console.log(`[Jina Cache] Hit for ${url}`);
    return cached.content;
  }

  const jinaApiKey = getDynamicEnv("JINA_API_KEY") || process.env.JINA_API_KEY;
  const targetUrl = `https://r.jina.ai/${url}`;

  const headers: Record<string, string> = {
    "x-preset": "article",
    "x-with-links-summary": "true"
  };
  if (jinaApiKey) {
    headers["Authorization"] = `Bearer ${jinaApiKey}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s per URL timeout

  try {
    console.log(`[Jina Reader] Fetching cleaned content for: ${url}`);
    const res = await fetch(targetUrl, {
      method: "GET",
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      let text = await res.text();
      // Cap at 4,000 chars per page to keep context efficient while giving rich detail
      if (text.length > 4000) {
        text = text.substring(0, 4000) + "\n\n...[Content Truncated for Context Length]...";
      }
      urlCache.set(url, { content: text, timestamp: Date.now() });
      return text;
    } else {
      console.warn(`[Jina Reader] Failed (${res.status}) for ${url}. Falling back to Tavily snippet.`);
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn(`[Jina Reader] Exception for ${url}: ${err.message}. Falling back to Tavily snippet.`);
  }

  // Fallback to Tavily snippet
  return `[Snippet Fallback]: ${tavilySnippet}`;
}

// Fast Web Search combining remote Tavily API (URLs & snippets) + r.jina.ai (cleaned LLM text)
async function performTavilySearch(query: string): Promise<string> {
  const tavilyApiKey = getDynamicEnv("TAVILY_API_KEY") || process.env.TAVILY_API_KEY;
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
        max_results: 3 // Top 3 URLs as specified
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[Tavily] Failed with HTTP ${response.status}`);
      return "Web search is currently unavailable (Provider error).";
    }

    const data = await response.json();
    if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
      console.log(`[Tavily] 0 results returned for query: "${query}"`);
      return "No relevant information found.";
    }

    const topResults = data.results.slice(0, 3);
    console.log(`[Tavily] Found ${topResults.length} top URLs. Extracting clean content via r.jina.ai...`);

    // Parallel fetch Jina cleaned content for top 3 URLs
    const cleanedResults = await Promise.all(
      topResults.map(async (resItem: any) => {
        const title = resItem.title?.trim() || "Untitled Source";
        const url = resItem.url || "";
        const snippet = resItem.content?.trim() || "";
        
        const cleanedText = await fetchJinaCleanedContent(url, snippet);

        return {
          title,
          url,
          snippet,
          cleanedText
        };
      })
    );

    let combinedContext = `Live Web Search Results for "${query}":\n\n`;

    cleanedResults.forEach((item, index) => {
      combinedContext += `--- Source [${index + 1}]: ${item.title} ---\n`;
      combinedContext += `URL: ${item.url}\n`;
      combinedContext += `Tavily Snippet: ${item.snippet}\n\n`;
      combinedContext += `Cleaned Article Content (r.jina.ai):\n${item.cleanedText}\n\n`;
    });

    return combinedContext;
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
    const serverRequestReceivedTime = Date.now();
    const perfId = req.headers["x-perf-id"] || `perf_${Date.now()}`;
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
      userId = "default_user",
      conversationId = "unknown_conv",
    } = req.body;

    // Smart Multi-Endpoint Routing logic
    if (provider === "custom" && isHealthCheckEnabled && modelRoutingMap[model]) {
      const route = modelRoutingMap[model];
      baseUrl = route.baseUrl;
      apiKey = route.apiKey;
    }

    let augmentedSystemPrompt = systemPrompt || "";
    
    // Central Context Builder Injection
    const promptBuildStartTime = Date.now();
    const userMessage = extractMessageText(messages.filter((m: any) => m.role === "user").pop());

    const backendCtx = buildContext(userId, conversationId, userMessage, model, messages);
    console.log(`\n[CONTEXT BUILDER]`);
    console.log(`USER ID: ${userId}`);
    console.log(`CONVERSATION ID: ${conversationId}`);
    console.log(`SELECTED MODEL: ${model}`);
    console.log(`USER QUERY: ${userMessage.substring(0, 100)}...`);
    console.log(`RETRIEVED MEMORIES: ${backendCtx.retrievedMemories.length}`);
    backendCtx.retrievedMemories.forEach(m => {
      console.log(` - [Score N/A] [${m.category}] ${m.content}`);
    });
    
    augmentedSystemPrompt += "\n" + backendCtx.contextStr;
    const promptBuildEndTime = Date.now();

    // Memory extraction deferred to after stream completion.
    const shouldExtractMemory = userMessage && userMessage.trim().length >= 3 && !isUserFactQuery(userMessage);

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

    // MULTIMODAL HYBRID ROUTING: Check for images and intercept if text-only model
    let hasImages = false;
    for (const m of messages) {
      if (Array.isArray(m.content)) {
        if (m.content.some((part: any) => part.type === "image_url")) {
          hasImages = true;
          break;
        }
      }
    }

    if (hasImages && !isVisionModel(model)) {
      console.log(`[Hybrid Vision] Model ${model} is text-only. Intercepting images for backend transcription...`);
      for (let i = 0; i < messages.length; i++) {
        if (Array.isArray(messages[i].content)) {
          let flattened = "";
          for (const part of messages[i].content) {
            if (part.type === "text") {
              flattened += part.text + "\n";
            } else if (part.type === "image_url") {
              const urlStr = part.image_url.url;
              const match = urlStr.match(/^data:(image\/\w+);base64,(.+)$/);
              if (match) {
                const mimeType = match[1];
                const base64 = match[2];
                const desc = await transcribeImage(base64, mimeType);
                flattened += `\n[IMAGE ANALYSIS TRANSCRIBED BY VISION MODEL]:\n${desc}\n`;
              }
            }
          }
          messages[i].content = flattened.trim();
        }
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
        .map((m: any) => {
          let parts = [];
          if (Array.isArray(m.content)) {
            parts = m.content.map((part: any) => {
              if (part.type === "text") return { text: part.text };
              if (part.type === "image_url") {
                const match = part.image_url.url.match(/^data:(image\/\w+);base64,(.+)$/);
                if (match) {
                  return { inlineData: { mimeType: match[1], data: match[2] } };
                }
                return { text: "[Image attached but invalid format]" };
              }
              return { text: "" };
            });
          } else {
            parts = [{ text: m.content || "" }];
          }
          return { role: m.role === "assistant" ? "model" : "user", parts };
        });

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
        .map((m: any) => {
          let content = m.content;
          if (Array.isArray(m.content)) {
            content = m.content.map((part: any) => {
              if (part.type === "text") return { type: "text", text: part.text };
              if (part.type === "image_url") {
                const match = part.image_url.url.match(/^data:(image\/\w+);base64,(.+)$/);
                if (match) {
                  return { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } };
                }
                return { type: "text", text: "[Image attached but invalid format]" };
              }
              return { type: "text", text: "" };
            });
          }
          return { role: m.role, content };
        });

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

    const requestType = "primary_chat";
    const requestId = "req_" + Date.now() + "_" + Math.random().toString(36).substring(7);

    console.log(`\n[AI REQUEST]
requestId: ${requestId}
requestType: ${requestType}
provider: ${provider}
model: ${model}
timestamp: ${new Date().toISOString()}`);

    const formattedMessages = [...messages];
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
      const cacheKey = `${model}|${endpoint.baseUrl}`;
      if (deadEndpoints[endpoint.baseUrl] && deadEndpoints[endpoint.baseUrl] > Date.now()) {
        console.warn(`[Fallback] Skipping ${endpoint.baseUrl} (Endpoint Circuit Breaker Active)`);
        continue;
      }
      if (deadModelEndpoints[cacheKey] && deadModelEndpoints[cacheKey] > Date.now()) {
        console.warn(`[Fallback] Skipping ${endpoint.baseUrl} for model ${model} (Model Circuit Breaker Active)`);
        continue;
      }

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
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 seconds timeout for initial connection and TTFT

      try {
        const providerRequestStartTime = Date.now();
        const response = await fetch(targetUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        const providerHeadersReceivedTime = Date.now();
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
          deadModelEndpoints[cacheKey] = Date.now() + 60000; // 1 min circuit breaker for this specific model on this endpoint
          
          if (response.status >= 502) {
             deadEndpoints[endpoint.baseUrl] = Date.now() + 30000; // 30 sec block for entire endpoint on 502/503
          }
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
          // Headers already sent by setupSSEResponse, must close stream
          res.write(`data: ${JSON.stringify({ error: "No response body received from upstream API." })}\n\n`);
          res.write("data: [DONE]\n\n");
          return res.end();
        }

        const reader = (response.body as any).getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let chunksCount = 0;
        let bytesCount = 0;
        let charCount = 0;
        let ttft: number | null = null;
        let firstChunkData: string = "";
        const startTime = Date.now();

        let providerFirstChunkTime: number | null = null;
        let providerFirstTokenTime: number | null = null;

        const isAffectedReasoningModel = (modelName: string) => {
          const lower = modelName.toLowerCase();
          return lower.includes("qwen") || lower.includes("deepseek") || lower.includes("reasoning") || lower.includes("think") || lower.includes("lorbus");
        };
        const shouldFilterReasoning = isAffectedReasoningModel(model);
        
        let isThinking = false;
        let thinkStartMatch = "";
        let thinkEndMatch = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          if (providerFirstChunkTime === null) providerFirstChunkTime = Date.now();
          if (ttft === null) ttft = Date.now() - startTime;
          chunksCount++;
          bytesCount += value.byteLength;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(":")) continue;

            if (trimmed.startsWith("data: ")) {
              const dataStr = trimmed.slice(6).trim();
              if (dataStr === "[DONE]") {
                if (shouldFilterReasoning && thinkStartMatch.length > 0) {
                   res.write(`data: ${JSON.stringify({ content: thinkStartMatch })}\n\n`);
                   thinkStartMatch = "";
                }
                res.write("data: [DONE]\n\n");
                continue;
              }
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.error) {
                  res.write(`data: ${JSON.stringify({ content: `\n\n[API Error: ${parsed.error.message || JSON.stringify(parsed.error)}]` })}\n\n`);
                  continue;
                }
                let content = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || "";
                
                if (content && shouldFilterReasoning) {
                  let outputContent = "";
                  for (let i = 0; i < content.length; i++) {
                      const char = content[i];
                      
                      if (!isThinking) {
                          const expected = "<think>"[thinkStartMatch.length];
                          if (char === expected) {
                              thinkStartMatch += char;
                              if (thinkStartMatch === "<think>") {
                                  isThinking = true;
                                  thinkStartMatch = ""; 
                              }
                          } else {
                              if (thinkStartMatch.length > 0) {
                                  outputContent += thinkStartMatch;
                                  thinkStartMatch = "";
                                  i--; 
                                  continue; 
                              } else {
                                  outputContent += char;
                              }
                          }
                      } else {
                          const expected = "</think>"[thinkEndMatch.length];
                          if (char === expected) {
                              thinkEndMatch += char;
                              if (thinkEndMatch === "</think>") {
                                  isThinking = false;
                                  thinkEndMatch = ""; 
                              }
                          } else {
                              if (thinkEndMatch.length > 0) {
                                  thinkEndMatch = "";
                                  if (char === '<') {
                                      thinkEndMatch = "<";
                                  }
                              }
                          }
                      }
                  }
                  content = outputContent;
                }

                if (content) {
                  if (charCount === 0) {
                     firstChunkData = content;
                     if (providerFirstTokenTime === null) providerFirstTokenTime = Date.now();
                  }
                  charCount += content.length;
                  res.write(`data: ${JSON.stringify({ content })}\n\n`);
                }
              } catch (e) {
                // Ignore parse chunk boundary issues
              }
            }
          }
        }
        
        const totalTime = Date.now() - startTime;
        


        console.log(`\n[AI RESPONSE]
requestId: ${requestId}
status: ${response.status}
contentType: ${contentType}
firstChunk: ${JSON.stringify(firstChunkData)}
ttft: ${ttft}ms
chunks: ${chunksCount}
bytes: ${bytesCount}
characters: ${charCount}`);

        const resultState = (chunksCount === 0 || charCount === 0) ? "EMPTY" : "SUCCESS";
        
        console.log(`\n[AI RESULT]
requestId: ${requestId}
model: ${model}
endpoint: ${endpoint.baseUrl}
result: ${resultState}
reason: Stream Finished Normal
totalTime: ${totalTime}ms\n`);

        console.log(`\n[PERF]
perf_id: ${perfId}
server_request_received: ${serverRequestReceivedTime}
prompt_build_start: ${promptBuildStartTime}
prompt_build_end: ${promptBuildEndTime}
provider_request_start: ${providerRequestStartTime}
provider_headers_received: ${providerHeadersReceivedTime}
provider_first_chunk: ${providerFirstChunkTime}
provider_first_token: ${providerFirstTokenTime}
generation_complete: ${Date.now()}`);

        res.write("data: [DONE]\n\n");
        res.end();
        
        console.log(`\n[CONCURRENCY] primary_completed: ${Date.now()}`);
        if (shouldExtractMemory) {
          console.log(`[CONCURRENCY] memory_started: ${Date.now()}`);
          extractDurableFactsFromTurn(userId, conversationId, userMessage)
            .then(() => console.log(`[CONCURRENCY] memory_completed: ${Date.now()}`))
            .catch(e => {
              console.warn("[Auto-Memory] Background extraction error:", e);
              console.log(`[CONCURRENCY] memory_completed: ${Date.now()}`);
            });
        }
        return;
      } catch (error: any) {
        clearTimeout(timeoutId);
        lastErrorResponseStatus = 504; // Gateway Timeout
        lastErrorParseMsg = error.name === 'AbortError' 
            ? "🚨 Model crashed or API limit exceeded! The server is experiencing high traffic and took too long to respond (> 15s). Please try again or switch to a different model in the bottom toolbar."
            : `Fetch error: ${error.message}`;
        console.warn(`[Fallback] ${model} on ${endpoint.baseUrl} exception: ${error.message}`);
        
        if (res.headersSent) {
          console.log(`\n[AI RESULT]
requestId: ${requestId}
model: ${model}
endpoint: ${endpoint.baseUrl}
result: INTERRUPTED
reason: Stream Error - ${error.message}
totalTime: N/A\n`);
          res.write(`data: ${JSON.stringify({ error: `Stream interrupted: ${error.message}` })}\n\n`);
          res.write("data: [DONE]\n\n");
          res.end();
          
          console.log(`\n[CONCURRENCY] primary_completed: ${Date.now()}`);
          if (shouldExtractMemory) {
            console.log(`[CONCURRENCY] memory_started: ${Date.now()}`);
            extractDurableFactsFromTurn(userId, conversationId, userMessage)
              .then(() => console.log(`[CONCURRENCY] memory_completed: ${Date.now()}`))
              .catch(e => {
                console.warn("[Auto-Memory] Background extraction error:", e);
                console.log(`[CONCURRENCY] memory_completed: ${Date.now()}`);
              });
          }
          return;
        }
        
        continue; // TRY NEXT ENDPOINT ONLY IF HEADERS NOT SENT
      }
    }
    
    // If we exit the loop, all endpoints failed
    console.error(`[Fallback] ALL endpoints failed for ${model}. Last error: ${lastErrorParseMsg}`);
    
    console.log(`\n[PERF]
perf_id: ${perfId}
server_request_received: ${serverRequestReceivedTime}
prompt_build_start: ${promptBuildStartTime}
prompt_build_end: ${promptBuildEndTime}
provider_request_start: ${Date.now()}
provider_headers_received: null
provider_first_chunk: null
provider_first_token: null
generation_complete: ${Date.now()}`);
    
    if (!res.headersSent) {
      res.status(lastErrorResponseStatus).json({ error: `Upstream API Error (${lastErrorResponseStatus}): ${lastErrorParseMsg}` });
    } else {
      res.write(`data: ${JSON.stringify({ error: `Stream interrupted: ${lastErrorParseMsg}` })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
    console.log(`\n[CONCURRENCY] primary_completed: ${Date.now()}`);
    if (shouldExtractMemory) {
      console.log(`[CONCURRENCY] memory_started: ${Date.now()}`);
      extractDurableFactsFromTurn(userId, conversationId, userMessage)
        .then(() => console.log(`[CONCURRENCY] memory_completed: ${Date.now()}`))
        .catch(e => {
          console.warn("[Auto-Memory] Background extraction error:", e);
          console.log(`[CONCURRENCY] memory_completed: ${Date.now()}`);
        });
    }
    return;

  } catch (err: any) {
    console.error("Chat API Error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    } else {
      res.write(`data: ${JSON.stringify({ error: err?.message || "Stream interrupted" })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
    console.log(`\n[CONCURRENCY] primary_completed: ${Date.now()}`);
    return;
  }
});

async function startServer() {
  // Shadow Evaluation Endpoint (Layer 4 Auto-Prompt Optimization)
  app.post("/api/shadow-evaluate", async (req, res) => {
    console.log("[Server] /api/shadow-evaluate triggered! Background Evolution is running...");
    try {
      const { historyText, userId = "default_user", globalSystemRules } = req.body;

      // --- One-time migration: if user has old flat rules but no behavior_model yet ---
      if (globalSystemRules) {
        migrateFromGlobalSystemRules(userId, globalSystemRules);
      }

      if (isEvolutionPaused(userId)) {
        console.log(`[Shadow Evaluate] Evolution paused for user ${userId}. Skipping.`);
        return res.json({ result: { signals: [], noChangeReason: "Evolution is paused." }, eventsApplied: [] });
      }

      const behaviorModel = loadBehaviorModel(userId);
      const existingRulesSummary = behaviorModel.rules
        .filter(r => r.status === 'active' || r.status === 'experimental')
        .map(r => `- [${r.id}] (ctx:${r.context}, conf:${r.confidence.toFixed(2)}) ${r.rule}`)
        .join('\n') || 'No existing rules yet.';

      const evalPrompt = `You are a strict, analytical AI Behavior Evaluator. Analyze chat logs and extract structured behavioral signals about the user's preferences.

EXISTING BEHAVIOR RULES (already learned — avoid duplicates):
${existingRulesSummary}

RECENT CONVERSATION LOGS:
${historyText || "No prior history."}

YOUR TASK:
Analyze the logs and identify ONLY meaningful, NEW behavioral signals that are NOT already covered by existing rules.

For each signal, determine:
- type: one of [correction, preference, frustration, positive, temporary]
  * correction = user explicitly corrected the AI or asked it to stop/change something
  * preference = user expressed a stable behavioral preference
  * frustration = user expressed dissatisfaction with response style
  * positive = user reacted positively, confirming a behavior should continue
  * temporary = user requested something just for now (exam, revision, etc.)
- context: one of [general, coding, debugging, exam, leetcode, creative, *]
  * Use * only for preferences that apply universally
- action: one of [ADD, EXPERIMENT, NO_CHANGE]
  * ADD = confident enough to add as active rule (confidence >= 0.7)
  * EXPERIMENT = uncertain, worth trying for a few interactions
  * NO_CHANGE = not enough signal
- category: one of [communication, tone, formatting, language, coding, workflow, identity, other]
- confidence: float from 0.0 to 1.0
  * explicit statement/correction: 0.85-0.95
  * repeated implicit pattern: 0.60-0.80
  * single observation: 0.40-0.60
- source: one of [explicit, implicit, correction, positive_signal]
- rule: a single abstract, actionable behavioral rule (no quotes, no examples, no user names)
- evidence: one short sentence explaining what in the logs drove this signal
- isTemporary: true if this is a temporary request (should expire after 5 interactions)

CRITICAL RULES:
1. If the logs are too short or generic (just greetings), return {"signals": [], "noChangeReason": "Insufficient signal"}
2. Do NOT hallucinate rules. Only extract what is clearly evidenced.
3. Do NOT duplicate existing rules above.
4. Do NOT include user names or private details in rule text.
5. Write rules in abstract, general terms (e.g. "Respond in Hinglish" not "Call the user Abhix and reply in Hinglish")
6. Maximum 5 signals per evaluation run.
7. Return ONLY valid JSON. No markdown, no explanation, no extra text.

OUTPUT FORMAT:
{
  "signals": [
    {
      "type": "correction",
      "context": "*",
      "action": "ADD",
      "category": "language",
      "confidence": 0.9,
      "source": "correction",
      "rule": "Respond in Hinglish unless the user writes in pure English",
      "evidence": "User explicitly corrected language preference multiple times",
      "isTemporary": false
    }
  ],
  "noChangeReason": null
}`;

      try {
        const userModels = getDynamicEnv("VITE_MEMORY_SUMMARIZER_MODEL") || "antigravity/gemini-3.6-flash-low";
        const modelsString = `${userModels},antigravity/gemini-3.6-flash-low`;
        
        const rawOutput = await executeBackgroundLLM(modelsString, evalPrompt, 1200);
        console.log("[Server] Shadow Evaluation raw output:", rawOutput.substring(0, 300));

        // --- Parse structured result ---
        let evaluatorResult: EvaluatorResult = { signals: [], noChangeReason: 'Parse failed' };
        try {
          const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            evaluatorResult = JSON.parse(jsonMatch[0]) as EvaluatorResult;
          }
        } catch (parseErr) {
          // Graceful fallback: if LLM returned the old plain-text format, wrap it
          if (rawOutput.trim() !== 'NO_CHANGE' && rawOutput.trim().length > 10) {
            // Convert old bullet list to minimal signal
            const lines = rawOutput.split('\n').map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(l => l.length > 8).slice(0, 5);
            evaluatorResult = {
              signals: lines.map(rule => ({
                type: 'preference' as const,
                context: '*' as const,
                action: 'ADD' as const,
                category: 'other' as const,
                confidence: 0.7,
                source: 'implicit' as const,
                rule,
                evidence: 'Inferred from legacy plain-text evaluator output.',
                isTemporary: false,
              })),
            };
          } else {
            evaluatorResult = { signals: [], noChangeReason: 'NO_CHANGE from evaluator.' };
          }
        }

        // --- Apply decisions to UserBehaviorModel ---
        const { model: updatedModel, eventsApplied } = applyEvolutionDecision(userId, evaluatorResult);

        // --- Build backward-compatible rules string for old frontend ---
        const legacyRules = updatedModel.rules
          .filter(r => r.status === 'active')
          .map(r => `- ${r.rule}`)
          .join('\n');

        console.log(`[Server] Evolution complete. Events: ${eventsApplied.length}. Active rules: ${updatedModel.rules.filter(r => r.status === 'active').length}`);
        
        res.json({
          // Backward-compatible: old frontend reads "rules" as a string
          rules: legacyRules || undefined,
          // New: structured response for upgraded frontend
          result: evaluatorResult,
          eventsApplied,
          model: {
            version: updatedModel.version,
            activeRulesCount: updatedModel.rules.filter(r => r.status === 'active').length,
            experimentalRulesCount: updatedModel.rules.filter(r => r.status === 'experimental').length,
          }
        });
      } catch (err: any) {
        console.error("[Shadow Evaluate] LLM fetch error:", err);
        res.status(500).json({ error: "Failed to generate evaluation rules." });
      }
    } catch (e: any) {
      console.error("[Shadow Evaluate] Global error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // EVOLUTION HUB MANAGEMENT ENDPOINTS
  // ============================================================

  // GET full UserBehaviorModel
  app.get("/api/evolution/model", (req, res) => {
    try {
      const userId = (req.query.userId as string) || "default_user";
      const model = loadBehaviorModel(userId);
      res.json({ ok: true, model });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET evolution history
  app.get("/api/evolution/history", (req, res) => {
    try {
      const userId = (req.query.userId as string) || "default_user";
      const model = loadBehaviorModel(userId);
      res.json({ ok: true, history: model.evolutionHistory, version: model.version });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST rollback last evolution
  app.post("/api/evolution/rollback", (req, res) => {
    try {
      const { userId = "default_user" } = req.body;
      const result = rollbackLastEvolution(userId);
      res.json({ ok: result.success, message: result.message, model: result.model });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // PATCH a specific rule (promote/reject/delete)
  app.patch("/api/evolution/rule/:id", (req, res) => {
    try {
      const { userId = "default_user", action } = req.body;
      const { id } = req.params;
      let success = false;
      if (action === 'promote') {
        success = promoteExperimentalRule(userId, id);
      } else if (action === 'reject') {
        success = rejectExperimentalRule(userId, id);
      } else if (action === 'delete') {
        success = deleteRule(userId, id);
      }
      res.json({ ok: success });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST pause/resume evolution
  app.post("/api/evolution/pause", (req, res) => {
    try {
      const { userId = "default_user", pause, durationMs = 24 * 60 * 60 * 1000 } = req.body;
      if (pause) {
        pauseEvolution(userId, durationMs);
        res.json({ ok: true, paused: true });
      } else {
        resumeEvolution(userId);
        res.json({ ok: true, paused: false });
      }
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET contextual rules for a given message (for debug/preview)
  app.get("/api/evolution/rules-preview", (req, res) => {
    try {
      const userId = (req.query.userId as string) || "default_user";
      const message = (req.query.message as string) || "";
      const rules = getActiveRulesForPrompt(userId, message);
      const paused = isEvolutionPaused(userId);
      res.json({ ok: true, rules, paused });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
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
        deadModelEndpoints[`${modelName}|${baseUrl}`] = Date.now() + 60000;
        if (response.status >= 502) deadEndpoints[baseUrl] = Date.now() + 30000;
      } else {
        // If it was dead, clear it since it's alive now
        delete deadModelEndpoints[`${modelName}|${baseUrl}`];
        delete deadEndpoints[baseUrl];
      }
      return response.ok;
    } catch (e: any) {
      clearTimeout(timeout);
      console.error(`[HealthCheck] ${modelName} on ${baseUrl} exception:`, e.message);
      deadModelEndpoints[`${modelName}|${baseUrl}`] = Date.now() + 60000;
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

  function getBaseModelName(modelString: string): string {
    if (!modelString) return "";
    const parts = modelString.trim().split("/");
    const last = parts[parts.length - 1].toLowerCase();
    return last.replace(/[-_.]/g, "");
  }

  function deduplicateModelsForUI(allModels: string[], activeModelsList: string[]): { filteredAll: string[], filteredActive: string[] } {
    const groups = new Map<string, string[]>();
    
    for (const model of allModels) {
      const base = getBaseModelName(model);
      if (!groups.has(base)) {
        groups.set(base, []);
      }
      groups.get(base)!.push(model);
    }

    const selectedModels: string[] = [];

    for (const modelsInGroup of groups.values()) {
      if (modelsInGroup.length === 1) {
        selectedModels.push(modelsInGroup[0]);
      } else {
        const activeInGroup = modelsInGroup.filter(m => activeModelsList.includes(m));
        if (activeInGroup.length > 0) {
          selectedModels.push(activeInGroup[0]);
        } else {
          selectedModels.push(modelsInGroup[0]);
        }
      }
    }

    const filteredActive = activeModelsList.filter(m => selectedModels.includes(m));

    return {
      filteredAll: selectedModels,
      filteredActive
    };
  }

  app.get("/api/active-models", (req, res) => {
    isHealthCheckEnabled = process.env.VITE_ENABLE_MODEL_HEALTH_CHECK === "true";
    const allModelsString = getDynamicEnv("VITE_API_MODELS") || "antigravity/gemini-3.6-flash-low,oc/big-pickle,oc/deepseek-v4-flash-free";
    const rawAllModels = Array.from(new Set(allModelsString.split(",").map((m: string) => m.trim()).filter(Boolean)));
    
    const { filteredAll, filteredActive } = deduplicateModelsForUI(rawAllModels, activeModels);

    res.json({
      isEnabled: isHealthCheckEnabled,
      activeModels: filteredActive,
      allModels: filteredAll
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

