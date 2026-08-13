import { ProviderPreset } from "../types";

const getEnvModels = (envVar: string | undefined, defaultModels: string[] = []): string[] => {
  if (envVar && envVar.trim() !== "") {
    return envVar.split(",").map(m => m.trim()).filter(Boolean);
  }
  return defaultModels;
};

// Get models from env, fallback to defaults if not set
const apiModels = getEnvModels(import.meta.env.VITE_API_MODELS, ["antigravity/gemini-3.6-flash-low", "oc/big-pickle", "oc/deepseek-v4-flash-free"]);
const combinedModels = Array.from(new Set([...apiModels]));

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "custom",
    name: "Custom / Local Endpoint",
    defaultBaseUrl: "http://localhost:8000/v1",
    defaultModel: combinedModels.length > 0 ? combinedModels[0] : "antigravity/gemini-3.6-flash-low",
    popularModels: combinedModels,
    placeholderKey: "Your API key or bearer token (optional)",
    description: "Connect to LM Studio, vLLM, Daytona, FastChat, local server, or custom OpenAI-compatible API proxy.",
    iconName: "Sliders",
  },
];

export const DEFAULT_CONFIG = {
  provider: "custom" as const,
  baseUrl: import.meta.env.VITE_API_BASE_URL || "https://20128-a38e1a7f-5433-4195-806b-597ab96eab62.daytonaproxy01.eu/v1",
  apiKey: import.meta.env.VITE_API_KEY || "sk-c3c3dcad25cf7393-98d439-998734cb",
  model: combinedModels.length > 0 ? combinedModels[0] : "antigravity/gemini-3.6-flash-low",
  systemPrompt: "You are a helpful, knowledgeable, and polite AI assistant.",
  temperature: 0.7,
  maxTokens: 2048,
  condenseWordLimit: 100000,
  condenseThreshold: 8,
  visionApiKey: "",
  theme: "system" as const,
  globalSystemRules: "",
};
