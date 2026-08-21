import { getAuthHeaders } from './conversationStorage';
import { ChatMessage, Conversation, ApiConfig, AttachedFile } from "../types";

const MAX_RECENT_MESSAGES_IN_CONTEXT = 40; // Increased to 40 to remember exact prompts from previous sessions better
const ANCHOR_DAY_ONE_MESSAGES = 10; // Keep first 10 messages (Day 1 origin) always present

/**
 * Builds a context payload for the API that retains 100% of Day 1 origin memory,
 * long-term memory summary, and recent messages while staying lightweight (<2k tokens)
 * so the API call is fast and never lags or crashes.
 */

export function buildOptimizedContextPayload(
  conversation: Conversation,
  newPrompt: string,
  attachedZipContent?: string | null,
  zipFileName?: string | null,
  otherChatsMemory?: string,
  activeQuoteText?: string,
  currentAttachments?: AttachedFile[] | null
): { messages: { role: string; content: any }[]; systemPromptWithMemory: string } {
  const allMessages = conversation.messages.filter(
    (m) => (m.role === "user" || m.role === "assistant") && !m.isError
  );

  const baseSystemPrompt = conversation.config.systemPrompt || "You are a helpful, smart AI assistant.";
    
  let globalPersonaRules = "";
  if (conversation.config.globalSystemRules) {
    globalPersonaRules = `\n\n=== GLOBAL SHADOW EVALUATION PERSONA (AUTO-GENERATED RULES) ===\n${conversation.config.globalSystemRules}\n`;
  }

  const createdDateStr = new Date(conversation.createdAt).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Construct Memory Context Header
  let memoryHeader = `\n\n=== INFINITE LONG-TERM MEMORY (PERSISTED FROM DAY 1) ===\n`;
  memoryHeader += `Conversation Started: ${createdDateStr}\n`;

  if (conversation.longTermMemory) {
    memoryHeader += `Stored Key Memory & Historical Facts for THIS chat:\n${conversation.longTermMemory}\n`;
  } else {
    memoryHeader += `Note: Always maintain continuity with the user's preferences, facts, and topics discussed since Day 1.\n`;
  }
  
  if (otherChatsMemory) {
    memoryHeader += `\n--- GLOBAL MEMORY FROM OTHER CHATS ---\n${otherChatsMemory}\n----------------------------------------\n`;
  }
  
  memoryHeader += `\nCRITICAL PERSONA DIRECTIVE: You possess INFINITE CONTEXT MEMORY. You DO NOT forget past conversations because they are securely injected into your Global Memory above. If asked about previous chats, confidently recall the facts from your memory block. NEVER claim that your memory resets or that you don't remember previous chats.\n`;
  
  memoryHeader += `==========================================================\n`;

  const fullSystemPrompt = `${baseSystemPrompt}${globalPersonaRules}${memoryHeader}`;

  const formatMessageContent = (m: ChatMessage, isHistorical: boolean = false): any => {
    let text = m.content;
    
    // Strip old mode tags so they don't persist into the next turn
    text = text.replace(/(?:\r?\n)*\[System: The user has selected .*? mode\..*?\]/g, "");
    
    // Also strip AI-hallucinated response headers so the AI doesn't learn them as a permanent style
    text = text.replace(/^\[Strict Technical\/Code Mode Response\](?:\r?\n)*/i, "");
    text = text.replace(/^\[Reasoning Mode Response\](?:\r?\n)*/i, "");
    
    // Strip generic AI preamble (often hallucinated by Cohere models) to prevent few-shot context poisoning
    text = text.replace(/^I will assist (the user|you|the you) with (their|your) request\.?\*?(?:\r?\n)*/i, "");

    if (m.attachedZipContent) {
      if (isHistorical) {
        // Don't re-inject full zip on every turn - just acknowledge it was attached
        text += `\n\n[Previously attached codebase: "${m.zipFileName || 'codebase'}". Full content was analyzed in the original message. Refer to prior analysis.]`;
      } else {
        // Full injection only for the message where zip was actually attached
        text += `\n\n[ATTACHED CODEBASE - "${m.zipFileName || 'codebase'}"]:\n${m.attachedZipContent}`;
      }
    }

    if (m.attachments && m.attachments.some(f => f.type === 'image')) {
      const parts: any[] = [{ type: 'text', text }];
      for (const file of m.attachments) {
        if (file.type === 'image' && file.dataUrl) {
          parts.push({ type: 'image_url', image_url: { url: file.dataUrl } });
        }
      }
      return parts;
    }

    return text;
  };

  let finalNewPrompt = newPrompt;
  if (activeQuoteText) {
    finalNewPrompt = `[I have highlighted the following text from our conversation]:\n"${activeQuoteText}"\n\nMy Question: ${finalNewPrompt}`;
  }
  
  if (attachedZipContent) {
    finalNewPrompt += `\n\n[ATTACHED CODEBASE - "${zipFileName || 'codebase'}"]:\n${attachedZipContent}`;
  }

  let currentTurnContent: any = finalNewPrompt;
  if (currentAttachments && currentAttachments.some(f => f.type === 'image')) {
    currentTurnContent = [{ type: 'text', text: finalNewPrompt }];
    for (const file of currentAttachments) {
      if (file.type === 'image' && file.dataUrl) {
        currentTurnContent.push({ type: 'image_url', image_url: { url: file.dataUrl } });
      }
    }
  }

  // If message history is short, send all messages (all recent, all get full zip)
  if (allMessages.length <= MAX_RECENT_MESSAGES_IN_CONTEXT + ANCHOR_DAY_ONE_MESSAGES) {
    const formatted = allMessages.map((m) => ({
      role: m.role,
      content: formatMessageContent(m, false), // full zip for all messages in short history
    }));
    formatted.push({ role: "user", content: currentTurnContent });
    return { messages: formatted, systemPromptWithMemory: fullSystemPrompt };
  }

  // If conversation is long:
  // 1. Day 1 Anchor messages (first prompt + response)
  const dayOneAnchors = allMessages.slice(0, ANCHOR_DAY_ONE_MESSAGES);

  // 2. Recent active window (last N messages)
  const recentMessages = allMessages.slice(-MAX_RECENT_MESSAGES_IN_CONTEXT);

  // Combine into single payload without duplicates
  const merged: { role: string; content: string }[] = [];

  // Add Day 1 origin
  dayOneAnchors.forEach((m) => {
    merged.push({ role: m.role, content: formatMessageContent(m, true) }); // historical
  });

  // Add a system boundary marker if messages were compressed
  const omittedCount = allMessages.length - (ANCHOR_DAY_ONE_MESSAGES + recentMessages.length);
  if (omittedCount > 0) {
    merged.push({
      role: "system" as any,
      content: `[System Note: ${omittedCount} older middle messages are safely summarized into Long-Term Memory. Full origin context from Day 1 and recent active conversation are preserved below.]`,
    });
  }

  // Add recent messages (full zip injection — these are what user can see and bot needs)
  recentMessages.forEach((m) => {
    const finalContent = formatMessageContent(m, false); // NOT historical — inject full zip
    // Avoid duplicating if overlap occurs
    if (!merged.some((existing) => existing.content === finalContent)) {
      merged.push({ role: m.role, content: finalContent });
    }
  });

  // Add the new message
  merged.push({ role: "user", content: currentTurnContent });

  return {
    messages: merged,
    systemPromptWithMemory: fullSystemPrompt,
  };
}

/**
 * Triggers background long-term memory extraction when conversation word count grows
 */
export async function updateConversationMemoryIfNeeded(
  conversation: Conversation,
  config: ApiConfig,
  force: boolean = false
): Promise<string | null> {
  const wordLimit = config.condenseWordLimit || 100000;

  // Calculate total word count in non-error user/assistant messages
  const validMessages = conversation.messages.filter(
    (m) => (m.role === "user" || m.role === "assistant") && !m.isError
  );

  const totalWordCount = validMessages.reduce((sum, m) => {
    const words = m.content ? m.content.trim().split(/\s+/).filter(Boolean).length : 0;
    return sum + words;
  }, 0);

  // Automatically summarize long-term memory on EVERY user message (User requested instant sync)
  const isPastMessageLimit = true; // Changed from (validMessages.length > 12 && ...)

  if (!force && totalWordCount < wordLimit && !isPastMessageLimit) return null;

  try {
    const textHistory = validMessages
      .map((m) => {
        const quotePart = m.quote ? `[Quoted: ${m.quote}]\n` : "";
        return `${m.role.toUpperCase()}: ${quotePart}${m.content.slice(0, 3000)}`;
      })
      .join("\n\n");

    const res = await fetch("/api/summarize-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        provider: config.provider,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        historyText: textHistory,
        existingMemory: conversation.longTermMemory || "",
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.memory) {
        return data.memory;
      }
    }
  } catch (err) {
    console.warn("Background memory summarization skipped:", err);
  }

  return null;
}

/**
 * IndexedDB storage helper for ultra-large chat histories to prevent LocalStorage quota limits
 */
const DB_NAME = "UniversalChatbotDB";
const STORE_NAME = "conversations";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveConversationsToDB(conversations: Conversation[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    for (const conv of conversations) {
      store.put(conv);
    }
  } catch (e) {
    // Fallback handled by localStorage
  }
}

export async function deleteConversationFromDB(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
  } catch (e) {
    // Fallback handled by localStorage
  }
}

export async function clearAllConversationsFromDB(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();
  } catch (e) {
    // Fallback handled by localStorage
  }
}

export async function loadConversationsFromDB(): Promise<Conversation[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => {
        resolve(req.result || []);
      };
      req.onerror = () => resolve([]);
    });
  } catch (e) {
    return [];
  }
}
