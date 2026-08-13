export type ProviderType =
  | "openai"
  | "gemini"
  | "anthropic"
  | "deepseek"
  | "groq"
  | "openrouter"
  | "ollama"
  | "together"
  | "custom";

export interface ProviderPreset {
  id: ProviderType;
  name: string;
  defaultBaseUrl: string;
  defaultModel: string;
  popularModels: string[];
  placeholderKey: string;
  description: string;
  iconName: string;
}

export interface ApiConfig {
  provider: ProviderType;
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens?: number;
  condenseWordLimit?: number;
  condenseThreshold?: number;
  visionApiKey?: string;
  theme?: "light" | "dark" | "system";
  webSearch?: boolean;
  globalSystemRules?: string;
}

export interface AttachedFile {
  id: string;
  type: "image" | "zip" | "text" | "other";
  fileName: string;
  mimeType?: string;
  dataUrl?: string; // base64 for images
  content?: string; // extracted text content for zips or plain text files
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  modelUsed?: string;
  responseTimeMs?: number;
  isError?: boolean;
  image?: string; // Legacy
  imageDescription?: string; // Legacy
  attachedZipContent?: string; // Legacy
  zipFileName?: string; // Legacy
  quote?: string;
  attachments?: AttachedFile[]; // New format supporting multiple files
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  config: ApiConfig;
  longTermMemory?: string;
  firstChatDate?: string;
}
