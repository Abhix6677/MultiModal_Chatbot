import React from "react";
import {
  Sparkles,
  Key,
  MessageSquare,
} from "lucide-react";
import { PROVIDER_PRESETS } from "../data/providers";
import { ProviderType } from "../types";

interface WelcomeScreenProps {
  onSelectPreset: (providerId: ProviderType) => void;
  onOpenConfig: () => void;
  onSendSuggestedPrompt: (prompt: string) => void;
  currentProvider: ProviderType;
  modelName: string;
  hasApiKey: boolean;
  longTermMemory?: string;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onSelectPreset,
  onOpenConfig,
  onSendSuggestedPrompt,
  currentProvider,
  modelName,
  hasApiKey,
}) => {
  const currentPreset =
    PROVIDER_PRESETS.find((p) => p.id === currentProvider) || PROVIDER_PRESETS[0];

  const promptSuggestions = [
    {
      title: "What is Next.js?",
      prompt: "What is Next.js and why should I use it?",
    },
    {
      title: "Help me write a Python script",
      prompt: "Help me write a Python script to scrape a website.",
    },
    {
      title: "Explain Quantum Computing",
      prompt: "Explain Quantum Computing to a 5 year old.",
    },
    {
      title: "Write a poem about a cat",
      prompt: "Write a short poem about a cat.",
    },
  ];

  return (
    <div className="w-full max-w-2xl mx-auto pt-16 sm:pt-24 px-4 font-sans flex flex-col h-full animate-in fade-in duration-500">
      <div className="flex-1 flex flex-col gap-6">
        {/* Hero Header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-muted rounded-2xl flex items-center justify-center border shadow-sm">
             <Sparkles className="w-6 h-6 text-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-medium text-foreground tracking-tight">
              Chatbot
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Powered by {currentPreset.name} ({modelName})
            </p>
          </div>
        </div>

        {/* API Key Missing Alert */}
        {!hasApiKey && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm text-destructive shadow-sm">
            <div className="flex items-center gap-3">
              <Key className="w-5 h-5 shrink-0" />
              <div>
                <span className="font-semibold block">API Configuration Required</span>
                <p className="opacity-90 text-xs mt-0.5">Please add your API key or configure your endpoint to start chatting.</p>
              </div>
            </div>
            <button
              onClick={onOpenConfig}
              className="px-4 py-2 bg-background hover:bg-muted text-foreground border rounded-lg text-sm font-medium shrink-0 transition-colors shadow-sm"
            >
              Configure API
            </button>
          </div>
        )}

        {/* Prompt Suggestions Grid */}
        <div className="mt-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {promptSuggestions.map((item, idx) => (
              <button
                key={idx}
                onClick={() => onSendSuggestedPrompt(item.prompt)}
                className="text-left bg-background hover:bg-muted/50 border rounded-xl p-4 transition-all duration-200 group flex items-start gap-3 shadow-sm hover:shadow-md"
              >
                <div className="p-2 bg-muted rounded-lg shrink-0">
                  <MessageSquare className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    {item.title}
                  </h4>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
