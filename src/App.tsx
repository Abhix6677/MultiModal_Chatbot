import React, { useState, useEffect, useRef, useCallback } from "react";
import { ProfileSelection } from "./components/ProfileSelection";
import { getAuthHeaders, setSessionToken, loadAllConversations, persistConversation, removeConversation, removeAllConversations, syncAllConversationsToServer } from "./utils/conversationStorage";
import {
  Menu,
  Sliders,
  Plus,
  Bot,
  Trash2,
  Sparkles,
  Brain,
  MessageSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Layers,
  Zap,
} from "lucide-react";
import { DEFAULT_CONFIG, PROVIDER_PRESETS } from "./data/providers";
import { ConfigModal } from "./components/ConfigModal";
import { Sidebar } from "./components/Sidebar";
import { getProfileStyle } from "./utils/profileStyle";
import { ApiConfig, ProviderType, Conversation, AttachedFile, ChatMessage } from "./types";
import { ChatMessageItem } from "./components/ChatMessageItem";
import { ChatInput } from "./components/ChatInput";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { MemoryModal } from "./components/MemoryModal";
import { EvolutionModal } from "./components/EvolutionModal";
import { GlobalSelectionPopover } from "./components/GlobalSelectionPopover";
import {
  buildOptimizedContextPayload,
  updateConversationMemoryIfNeeded,
} from "./utils/memory";

const LOCAL_STORAGE_KEY_CONFIG = "ai_studio_chatbot_config_v2";
const LOCAL_STORAGE_KEY_CONVERSATIONS = "ai_studio_chatbot_conversations_v2";
const LOCAL_STORAGE_KEY_CURRENT_CONV = "ai_studio_chatbot_current_conv_v2";

const getProfileScopedKey = (baseKey: string) => {
  const profileId = localStorage.getItem("ai_studio_active_profile_id") || "default";
  return `${baseKey}_${profileId}`;
};

export default function App() {
  const [sessionToken, setSessionTokenState] = useState(() => localStorage.getItem("ai_studio_session_token") || "");
  if (sessionToken) setSessionToken(sessionToken);

  const [config, setConfig] = useState<ApiConfig>(() => {
    let loadedConfig = DEFAULT_CONFIG;
    try {
      const scopedKey = getProfileScopedKey(LOCAL_STORAGE_KEY_CONFIG);
      const saved = localStorage.getItem(scopedKey);
      if (saved) {
        loadedConfig = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      } else {
        const oldGlobal = localStorage.getItem(LOCAL_STORAGE_KEY_CONFIG);
        if (oldGlobal) {
          loadedConfig = { ...DEFAULT_CONFIG, ...JSON.parse(oldGlobal) };
        }
      }
    } catch (e) {
      // fallback
    }
    
    // Force hardcoded values overriding any localStorage
    loadedConfig.baseUrl = import.meta.env.VITE_API_BASE_URL || "https://20128-a38e1a7f-5433-4195-806b-597ab96eab62.daytonaproxy01.eu/v1";
    loadedConfig.apiKey = import.meta.env.VITE_API_KEY || "sk-c3c3dcad25cf7393-98d439-998734cb";
    
    return loadedConfig;
  });

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isDbLoaded, setIsDbLoaded] = useState(false);

  // Clear legacy bloated localStorage data to free up 5MB quota (Fixes QuotaExceededError for config saves)
  useEffect(() => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY_CONVERSATIONS);
    } catch (e) {}
  }, []);

  const [quotedText, setQuotedText] = useState<{ text: string, messageId?: string } | null>(null);
  const [currentConvId, setCurrentConvId] = useState<string>("");

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [isEvolutionOpen, setIsEvolutionOpen] = useState(false);
  const [streamingConversations, setStreamingConversations] = useState<Set<string>>(new Set());
  const [visibleCountMap, setVisibleCountMap] = useState<Record<string, number>>({});

  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const isStreaming = streamingConversations.has(currentConvId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversations securely from backend for the current profile
  useEffect(() => {
    let isActive = true;
    async function loadConversationsSecurely() {
      // Small delay to ensure session token is fully set
      await new Promise(r => setTimeout(r, 50));
      const serverConvs = await loadAllConversations();
      
      if (!isActive) return;

      if (serverConvs && serverConvs.length > 0) {
        setConversations(serverConvs);
        try {
          const savedId = localStorage.getItem(getProfileScopedKey(LOCAL_STORAGE_KEY_CURRENT_CONV));
          if (savedId && serverConvs.some((c: Conversation) => c.id === savedId)) {
            setCurrentConvId(savedId);
          } else {
            setCurrentConvId(serverConvs[0].id);
          }
        } catch(e) {
          setCurrentConvId(serverConvs[0].id);
        }
      } else {
        const initId = "conv_" + Date.now();
        const initialConv: Conversation = {
          id: initId,
          title: "New Chat",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
          config: config,
        };
        setConversations([initialConv]);
        setCurrentConvId(initId);
      }
      setIsDbLoaded(true);
    }
    if (sessionToken) {
      try {
        const scopedKey = getProfileScopedKey(LOCAL_STORAGE_KEY_CONFIG);
        const saved = localStorage.getItem(scopedKey);
        if (saved) {
          setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(saved) });
        } else {
          const oldGlobal = localStorage.getItem(LOCAL_STORAGE_KEY_CONFIG);
          if (oldGlobal) {
            setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(oldGlobal) });
          } else {
            setConfig(DEFAULT_CONFIG);
          }
        }
      } catch (e) {}
      loadConversationsSecurely();
    }
    return () => { isActive = false; };
  }, [sessionToken]);

  // Handle Theme switching
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = () => {
      const themePref = (config.theme && config.theme !== "system") ? config.theme : "dark";
      if (themePref === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    };
    applyTheme();
  }, [config.theme]);

  // Save config to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(getProfileScopedKey(LOCAL_STORAGE_KEY_CONFIG), JSON.stringify(config));
    } catch (e) {
      console.error("Failed to save config to localStorage", e);
    }
  }, [config]);

  // Save conversations to IndexedDB
  useEffect(() => {
    if (!isDbLoaded) return;
    const timer = setTimeout(() => {
      try {
        syncAllConversationsToServer(conversations);
      } catch (e) {
        console.error("Failed to save conversations to IndexedDB", e);
      }
    }, 500); // Debounce to prevent blocking the main thread and flooding IndexedDB during streaming

    return () => clearTimeout(timer);
  }, [conversations, isDbLoaded]);

  // Save current conversation ID to LocalStorage
  useEffect(() => {
    if (currentConvId) {
      try {
        localStorage.setItem(getProfileScopedKey(LOCAL_STORAGE_KEY_CURRENT_CONV), currentConvId);
      } catch (e) {}
    }
  }, [currentConvId]);

  // Synchronous emergency save to IndexedDB before page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        syncAllConversationsToServer(conversations);
        if (currentConvId) {
          localStorage.setItem(getProfileScopedKey(LOCAL_STORAGE_KEY_CURRENT_CONV), currentConvId);
        }
      } catch (e) {}
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [conversations, currentConvId]);

  const currentConv =
    conversations.find((c) => c.id === currentConvId) || conversations[0];
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentConv?.messages.length]);

  // Conversation Management Handlers
  const handleNewConversation = () => {
    const newId = "conv_" + Date.now();
    const newConv: Conversation = {
      id: newId,
      title: "New Chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      config: config,
    };
    setConversations((prev) => [newConv, ...prev]);
    setCurrentConvId(newId);
  };

  const handleTogglePinConversation = (id: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c))
    );
    // State change will trigger the useEffect that calls saveConversationsToDB
  };

  const handleDeleteConversation = (id: string) => {
    removeConversation(id);
    setConversations((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      if (filtered.length === 0) {
        const fallbackId = "conv_" + Date.now();
        const fallbackConv: Conversation = {
          id: fallbackId,
          title: "New Chat",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
          config: config,
        };
        setCurrentConvId(fallbackId);
        return [fallbackConv];
      }
      if (currentConvId === id) {
        setCurrentConvId(filtered[0].id);
      }
      return filtered;
    });
  };

  const handleRenameConversation = (id: string, newTitle: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
    );
  };

  const handleClearAll = () => {
    if (window.confirm("Are you sure you want to clear all chat history?")) {
      removeAllConversations();
      const initId = "conv_" + Date.now();
      const freshConv: Conversation = {
        id: initId,
        title: "New Chat",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        config: config,
      };
      setConversations([freshConv]);
      setCurrentConvId(initId);
    }
  };

  const handleImportConversations = (imported: Conversation[]) => {
    if (Array.isArray(imported) && imported.length > 0) {
      setConversations(imported);
      setCurrentConvId(imported[0].id);
    }
  };

  const handleSelectPresetFromWelcome = (providerId: ProviderType) => {
    const preset = PROVIDER_PRESETS.find((p) => p.id === providerId);
    if (preset) {
      setConfig((prev) => ({
        ...prev,
        provider: providerId,
        baseUrl: preset.defaultBaseUrl,
        model: preset.defaultModel,
      }));
    }
  };

  const handleUpdateMemory = (newMemory: string, newIndex?: number) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === currentConv.id) {
          const updatedConv = {
            ...c,
            longTermMemory: newMemory,
            ...(newIndex !== undefined ? { lastSummarizedMessageIndex: newIndex } : {})
          };
          return updatedConv;
        }
        return c;
      })
    );
  };

  // ============================================================
  // Background Auto-Evolution Logic (Layer 4)
  // ============================================================
  const lastEvolvedMsgCountRef = useRef(currentConv?.messages.length || 0);

  // Shared evolution runner — used by both triggers below
  const runBackgroundEvolution = useCallback(async (triggerReason: string) => {
    if (!conversations || conversations.length === 0) return;
    console.log(`[CONCURRENCY] shadow_started: ${Date.now()} (reason: ${triggerReason})`);
    const recentConvs = conversations.slice(0, 5);
    const historyText = recentConvs.map(conv => {
      const msgs = conv.messages.slice(-10).map(m => `${m.role.toUpperCase()}: ${m.content.substring(0, 500)}`).join("\n");
      return `--- CHAT: ${conv.title} ---\n${msgs}`;
    }).join("\n\n");
    try {
      const res = await fetch("/api/shadow-evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          historyText,
          userId: "default_user",
          globalSystemRules: config.globalSystemRules || "",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.rules && typeof data.rules === "string" && data.rules.trim()) {
          setConfig((prev) => ({ ...prev, globalSystemRules: data.rules }));
        }
      }
      console.log(`[CONCURRENCY] shadow_completed: ${Date.now()}`);
    } catch (e) {
      console.error("Background evolution failed", e);
      console.log(`[CONCURRENCY] shadow_completed: ${Date.now()}`);
    }
  }, [conversations, config.globalSystemRules]);

  // Trigger 1: Every 1 message (User requested instant sync)
  useEffect(() => {
    const currentLen = currentConv?.messages.length || 0;
    if (currentLen >= lastEvolvedMsgCountRef.current + 1) {
      lastEvolvedMsgCountRef.current = currentLen;
      runBackgroundEvolution("1-message-threshold");
    }
  }, [currentConv?.messages.length, runBackgroundEvolution]);

  // Trigger 2: Immediate on correction signals
  const lastCorrectionMsgRef = useRef<string>("");
  useEffect(() => {
    if (!currentConv || !currentConv.messages.length) return;
    const msgs = currentConv.messages;
    const lastUserMsg = [...msgs].reverse().find(m => m.role === "user");
    if (!lastUserMsg || lastUserMsg.content === lastCorrectionMsgRef.current) return;
    lastCorrectionMsgRef.current = lastUserMsg.content;
    const correctionPatterns = /\b(don't|do not|stop|never|you forgot|you always|wrong|incorrect|i said|remember|told you|i told|not like this|i asked for|please remember|i prefer|from now on|always use|always say|never say|never use)\b/i;
    if (correctionPatterns.test(lastUserMsg.content)) {
      console.log("[Evolution] Correction signal — triggering immediate evolution.");
      runBackgroundEvolution("correction-signal");
    }
  }, [currentConv?.messages.length, runBackgroundEvolution]);

  // High Throughput Streaming Message Dispatcher
  const handleSendMessage = async (
    text: string,
    files: any[] = [],
    mode?: "chat" | "code" | "reasoning",
    webSearch?: boolean
  ) => {
    if ((!text.trim() && files.length === 0) || !currentConv) return;

    if (!config.apiKey && config.provider !== "gemini" && config.provider !== "ollama" && config.provider !== "custom") {
      setIsConfigOpen(true);
      return;
    }

    const userMessageId = "msg_user_" + Date.now();
    const assistantMessageId = "msg_ast_" + Date.now();

    let finalContent = text || (files.length > 0 ? `[Attached ${files.length} File(s)]` : "");
    const activeQuoteText = quotedText ? quotedText.text : undefined;
    if (quotedText) {
      setQuotedText(null);
    }
    if (mode === "code") {
      finalContent += "\n\n[System: The user has selected 'Code' mode. Please prioritize providing clean, optimized code, technical implementation details, and minimal fluff.]";
    } else if (mode === "reasoning") {
      finalContent += "\n\n[System: The user has selected 'Reasoning' mode. Please think step-by-step and provide a detailed logical breakdown of your reasoning process before answering.]";
    }

    const userMsg = {
      id: userMessageId,
      role: "user",
      content: finalContent,
      timestamp: Date.now(),
      attachments: files,
      quote: activeQuoteText,
    };

    const initialAssistantMsg = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      modelUsed: config.model,
    };

    let updatedTitle = currentConv.title;
    if (currentConv.messages.length === 0) {
      const displayTitle = text || (files.length > 0 ? files[0].fileName : "Prompt");
      updatedTitle = displayTitle.length > 32 ? displayTitle.slice(0, 32) + "..." : displayTitle;
    }

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === currentConv.id) {
          return {
            ...c,
            title: updatedTitle,
            updatedAt: Date.now(),
            messages: [...c.messages, userMsg as any, initialAssistantMsg as any],
          };
        }
        return c;
      })
    );

    setStreamingConversations(prev => {
      const next = new Set(prev);
      next.add(currentConv.id);
      return next;
    });
    
    const abortController = new AbortController();
    abortControllersRef.current.set(currentConv.id, abortController);

    let accumulatedText = "";
    const startTime = Date.now();
    
    // Define outside try block so we can use in catch block
    let effectiveBaseUrl = config.baseUrl;
    
    try {
      let textToSubmit = text;

      // Process Attached Files
      if (files.length > 0) {
        // Show immediate visual indicator that files are being processed
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id === currentConv.id) {
              const newMsgs = c.messages.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: "🔍 *Analyzing attached files...*" }
                  : m
              );
              return { ...c, messages: newMsgs };
            }
            return c;
          })
        );

        let appendedFilesContext = "";
        
        for (const file of files) {
          if (file.type === "zip" || file.type === "text") {
            appendedFilesContext += `\n\n[FILE CONTENT: ${file.fileName}]\n${file.content}`;
          }
        }
        
        if (appendedFilesContext) {
           textToSubmit = `[ATTACHED FILES CONTEXT]:${appendedFilesContext}\n\n[USER QUESTION / PROMPT]:\n${text || "Please analyze the attached files and answer."}`;
        }
      }

      // Limit global memory injection to avoid bloating the context window (which causes slow LLM responses)
      const otherChatsMemory = conversations
        .filter(c => c.id !== currentConv.id && c.longTermMemory && !c.longTermMemory.includes("Backend memory updated."))
        .slice(0, 5) // Only include the 5 most recent chats with valid summary
        .map(c => `[From prior chat "${c.title}"]: ${c.longTermMemory}`)
        .join('\n\n')
        .substring(0, 4000); // Hard limit to 4000 characters
      
      const { messages: payloadMessages, systemPromptWithMemory } =
        buildOptimizedContextPayload(currentConv, textToSubmit, null, null, otherChatsMemory, activeQuoteText, files);

      effectiveBaseUrl = config.baseUrl;
      const effectiveApiKey = config.apiKey;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        signal: abortController.signal,
        body: JSON.stringify({
          provider: config.provider,
          baseUrl: effectiveBaseUrl,
          apiKey: effectiveApiKey,
          model: config.model,
          messages: payloadMessages,
          systemPrompt: systemPromptWithMemory,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          webSearch: webSearch,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP error! status: ${response.status}`);
      }

      if (!response.body) throw new Error("No response body received.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let lastRenderTime = 0;

      const renderThrottledText = (text: string, force = false) => {
        const now = Date.now();
        if (force || now - lastRenderTime > 20) {
          lastRenderTime = now;
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id === currentConv.id) {
                const newMsgs = c.messages.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: text }
                    : m
                );
                return { ...c, messages: newMsgs, updatedAt: Date.now() };
              }
              return c;
            })
          );
        }
      };

      let streamBuffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        streamBuffer += decoder.decode(value, { stream: true });
        const lines = streamBuffer.split("\n");
        streamBuffer = lines.pop() || "";

        let isStreamFinished = false;
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.replace("data: ", "").trim();
            if (jsonStr === "[DONE]") {
              isStreamFinished = true;
              break;
            }

            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.content) {
                accumulatedText += parsed.content;
                renderThrottledText(accumulatedText, false);
              }
            } catch (e) {
              // ignore partial chunk
            }
          }
        }
        if (isStreamFinished) break;
      }

      // Ensure final frame is rendered
      renderThrottledText(accumulatedText, true);

      const elapsed = Date.now() - startTime;
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === currentConv.id) {
            const finalMsgs = c.messages.map((m) =>
              m.id === assistantMessageId
                ? { ...m, responseTimeMs: elapsed }
                : m
            );
            return { ...c, messages: finalMsgs, updatedAt: Date.now() };
          }
          return c;
        })
      );

      // Background Day 1 Infinite Memory extraction
      const updatedConvForMemory: Conversation = {
        ...currentConv,
        messages: [
          ...currentConv.messages,
          { id: userMessageId, role: "user", content: text, timestamp: startTime },
          { id: assistantMessageId, role: "assistant", content: accumulatedText, timestamp: Date.now() },
        ],
      };
      updateConversationMemoryIfNeeded(updatedConvForMemory, config).then((extractedMemory) => {
        if (extractedMemory) {
          const newIndex = updatedConvForMemory.messages.length - 1;
          handleUpdateMemory(extractedMemory, newIndex);
        }
      });
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("Streaming stopped by user");
      } else {
        const errorText = err.message || "Failed to communicate with API provider.";
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id === currentConv.id) {
              const errMsgs = c.messages.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      content: `⚠️ **API Communication Error:** ${errorText}\n\n*Please check your API key, Base URL (${effectiveBaseUrl}), and model name in Settings.*`,
                      isError: true,
                    }
                  : m
              );
              return { ...c, messages: errMsgs };
            }
            return c;
          })
        );
      }
    } finally {
      setStreamingConversations(prev => {
        const next = new Set(prev);
        next.delete(currentConv.id);
        return next;
      });
      abortControllersRef.current.delete(currentConv.id);
    }
  };

  const handleStopStreaming = () => {
    if (!currentConvId) return;
    const controller = abortControllersRef.current.get(currentConvId);
    if (controller) {
      controller.abort();
      setStreamingConversations(prev => {
        const next = new Set(prev);
        next.delete(currentConvId);
        return next;
      });
      abortControllersRef.current.delete(currentConvId);
    }
  };

  const handleRetryLastMessage = () => {
    if (!currentConv || currentConv.messages.length < 2) return;

    const userMsgs = currentConv.messages.filter((m) => m.role === "user");
    if (userMsgs.length === 0) return;
    const lastUserMsg = userMsgs[userMsgs.length - 1];

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === currentConv.id) {
          const sliced = c.messages.slice(0, c.messages.length - 2);
          return { ...c, messages: sliced };
        }
        return c;
      })
    );

    handleSendMessage(lastUserMsg.content);
  };

  const handleEditUserMessage = (msgId: string, newContent: string) => {
    if (!currentConv) return;
    const msgIdx = currentConv.messages.findIndex((m) => m.id === msgId);
    if (msgIdx === -1) return;

    const updatedMsgs = currentConv.messages.slice(0, msgIdx);
    setConversations((prev) =>
      prev.map((c) =>
        c.id === currentConv.id ? { ...c, messages: updatedMsgs } : c
      )
    );

    handleSendMessage(newContent);
  };

  const currentProviderPreset =
    PROVIDER_PRESETS.find((p) => p.id === config.provider) || PROVIDER_PRESETS[0];

  // Sliding message window to keep rendering zero-lag regardless of conversation length
  const maxWindow = visibleCountMap[currentConv?.id || ""] || 30;
  const totalMsgs = currentConv?.messages.length || 0;
  const visibleMessages =
    totalMsgs <= maxWindow
      ? currentConv?.messages || []
      : currentConv?.messages.slice(-maxWindow) || [];


  const handleQuoteRef = useRef((t: string) => setQuotedText({ text: t }));
  const handleRetryLastMessageRef = useRef(handleRetryLastMessage);
  const handleEditUserMessageRef = useRef(handleEditUserMessage);

  useEffect(() => {
    handleQuoteRef.current = (t: string) => setQuotedText({ text: t });
    handleRetryLastMessageRef.current = handleRetryLastMessage;
    handleEditUserMessageRef.current = handleEditUserMessage;
  });

  const stableHandleQuote = useCallback((t: string) => handleQuoteRef.current(t), []);
  const stableHandleRetry = useCallback(() => handleRetryLastMessageRef.current(), []);
  const stableHandleEdit = useCallback((id: string, text: string) => handleEditUserMessageRef.current(id, text), []);

  if (!sessionToken) {
    return <ProfileSelection onProfileSelected={(token, profile) => {
      localStorage.setItem("ai_studio_session_token", token);
      localStorage.setItem("ai_studio_active_profile_id", profile.id);
      localStorage.setItem("ai_studio_active_profile_name", profile.name);
      setSessionToken(token);
      setSessionTokenState(token);
    }} />;
  }

  if (!isDbLoaded) {
    return (
      <div className="flex h-[100dvh] w-screen items-center justify-center bg-app-bg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-screen bg-app-bg text-app-fg overflow-hidden font-sans antialiased">
      {/* Navigation Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onSwitchProfile={() => {
          localStorage.removeItem("ai_studio_session_token");
          localStorage.removeItem("ai_studio_active_profile_id");
          localStorage.removeItem("ai_studio_active_profile_name");
          setSessionToken("");
          setSessionTokenState("");
        }}

        onClose={() => setIsSidebarOpen(false)}
        conversations={conversations}
        currentConversationId={currentConvId}
        onSelectConversation={(id) => setCurrentConvId(id)}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onTogglePinConversation={handleTogglePinConversation}
        onClearAll={handleClearAll}
        onOpenConfig={() => setIsConfigOpen(true)}
        config={config}
        onImportConversations={handleImportConversations}
        onOpenMemory={() => setIsMemoryOpen(true)}
        onOpenEvolution={() => setIsEvolutionOpen(true)}
      />

      {/* Main Generative AI Chat Panel */}
      <div className={`flex-1 flex flex-col h-full overflow-hidden bg-app-bg bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.06),rgba(255,255,255,0))] transition-all duration-300 ${
        isSidebarOpen ? "lg:ml-72" : "ml-0"
      }`}>
        {/* Top Header Navigation */}
        <header className="h-14 px-4 bg-app-bg/90 border-b border-app-border backdrop-blur-md flex items-center justify-between shrink-0 z-10 shadow-xs">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 text-app-muted hover:text-app-fg hover:bg-app-surface-hover rounded-xl transition-colors shrink-0"
              title="Toggle Sidebar"
            >
              {isSidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            </button>

            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <h2 className="font-bold text-sm text-app-fg tracking-tight truncate sm:max-w-xs">
                {currentConv?.title || "New Chat"}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Active Profile Indicator */}
            {localStorage.getItem("ai_studio_active_profile_id") && (
              <div 
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-app-border bg-app-surface text-app-fg text-xs font-medium cursor-default hover:bg-app-surface-hover transition-colors"
                title="Current Profile"
              >
                <span>{getProfileStyle(localStorage.getItem("ai_studio_active_profile_id") || "").emoji}</span>
                <span className="truncate max-w-[100px]">{localStorage.getItem("ai_studio_active_profile_name") || "Profile"}</span>
              </div>
            )}
            
            {/* Day 1 Memory Status Button */}
            <button
              onClick={() => setIsMemoryOpen(true)}
              className="px-3 py-1 bg-app-surface hover:bg-app-surface-hover border border-app-border text-app-fg rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              title="Inspect Memory"
            >
              <Brain className="w-3.5 h-3.5 text-app-primary" />
              <span className="hidden md:inline">Memory</span>
            </button>

            {/* AI Evolution Hub Button */}
            <button
              onClick={() => setIsEvolutionOpen(true)}
              className="px-3 py-1 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-600 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              title="AI Evolution Hub (Layer 4 Auto-Prompt Optimization)"
            >
              <Zap className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Evolve AI</span>
            </button>

            {/* API Settings Button */}
            <button
              onClick={() => setIsConfigOpen(true)}
              className="p-2 text-app-muted hover:text-app-fg hover:bg-app-surface-hover rounded-xl transition-colors"
              title="API Configuration"
            >
              <Sliders className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Scrollable Area (Main + Footer) */}
        <div id="chat-scroll-container" className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden overscroll-none relative">
          {/* Chat Thread Container */}
          <main className="flex-1 w-full relative">
            <GlobalSelectionPopover onQuote={(t, mId) => setQuotedText({ text: t, messageId: mId })} scrollContainerId="chat-scroll-container" />
          <div className="p-4 sm:p-6 space-y-4 max-w-5xl w-full mx-auto">
          {currentConv?.messages.length === 0 ? (
            <WelcomeScreen
              onSelectPreset={handleSelectPresetFromWelcome}
              onOpenConfig={() => setIsConfigOpen(true)}
              onSendSuggestedPrompt={(text) => handleSendMessage(text, [])}
              currentProvider={config.provider}
              modelName={config.model}
              hasApiKey={
                Boolean(config.apiKey) ||
                config.provider === "gemini" ||
                config.provider === "ollama" ||
                config.provider === "custom" ||
                Boolean(config.baseUrl)
              }
              longTermMemory={currentConv.longTermMemory}
            />
          ) : (
            <>
              {/* Show Earlier Messages Toggle */}
              {totalMsgs > maxWindow && (
                <div className="text-center my-2">
                  <button
                    onClick={() => {
                      const container = document.getElementById("chat-scroll-container");
                      const oldScrollHeight = container ? container.scrollHeight : 0;
                      const oldScrollTop = container ? container.scrollTop : 0;

                      setVisibleCountMap((prev) => ({
                        ...prev,
                        [currentConv.id]: (prev[currentConv.id] || 30) + 50,
                      }));

                      if (container) {
                        requestAnimationFrame(() => {
                          setTimeout(() => {
                            const newScrollHeight = container.scrollHeight;
                            container.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
                          }, 10);
                        });
                      }
                    }}
                    className="px-4 py-1.5 bg-app-card hover:bg-app-surface-hover text-app-fg text-xs font-mono rounded-xl border border-app-border transition-colors inline-flex items-center gap-2 shadow-xs"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-app-primary" />
                    Load 50 earlier messages ({totalMsgs - maxWindow} hidden)
                  </button>
                </div>
              )}

              {visibleMessages.map((msg, index) => (
                <ChatMessageItem
                  onQuote={stableHandleQuote}
                  key={msg.id}
                  message={msg}
                  isLastAssistantMessage={
                    index === visibleMessages.length - 1 &&
                    msg.role === "assistant"
                  }
                  isStreaming={isStreaming}
                  onRetry={stableHandleRetry}
                  onEdit={stableHandleEdit}
                  providerName={config.model || "Assistant"}
                />
              ))}
            </>
          )}


          <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Bottom Floating Prompt Footer */}
        <footer className="sticky bottom-0 shrink-0 bg-app-bg/90 backdrop-blur-md pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] z-20">
          {isStreaming && import.meta.env.VITE_SMARTLINK_AD_URL && (
            <div className="flex justify-center mb-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <a 
                href={import.meta.env.VITE_SMARTLINK_AD_URL} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-xs font-medium rounded-full border border-indigo-500/20 transition-colors shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 animate-pulse text-indigo-400" />
                <span>AI is thinking... While you wait, check out today's sponsor!</span>
              </a>
            </div>
          )}
          <ChatInput
            onSendMessage={handleSendMessage}
            isStreaming={isStreaming}
            quotedText={quotedText ? quotedText.text : null}
            onClearQuote={() => setQuotedText(null)}
            onStopStreaming={handleStopStreaming}
            onOpenConfig={() => setIsConfigOpen(true)}
            hasMessages={currentConv?.messages.length > 0}
            modelName={config.model}
          />
        </footer>
        </div>
      </div>

      {/* Config Settings Modal */}
      <ConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        config={config}
        onSave={(newConfig) => setConfig(newConfig)}
      />

      {/* Day 1 Memory Inspection Modal */}
      <MemoryModal
        isOpen={isMemoryOpen}
        onClose={() => setIsMemoryOpen(false)}
        conversation={currentConv}
        onUpdateMemory={handleUpdateMemory}
        onForceEvolve={() => runBackgroundEvolution("manual-force")}
        config={config}
      />

      {/* AI Evolution Hub Modal */}
      <EvolutionModal
        isOpen={isEvolutionOpen}
        onClose={() => setIsEvolutionOpen(false)}
        config={config}
        onUpdateConfig={(newConfig) => setConfig((prev) => ({ ...prev, ...newConfig }))}
        conversations={conversations}
      />
    </div>
  );
}
