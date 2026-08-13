import React from "react";
import {
  Sparkles,
  Brain,
  Zap,
  Code2,
  Key,
  Compass,
  FileText,
  Lightbulb,
  Cpu,
  ArrowRight,
  ShieldCheck,
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
  longTermMemory,
}) => {
  const currentPreset =
    PROVIDER_PRESETS.find((p) => p.id === currentProvider) || PROVIDER_PRESETS[0];

  const promptSuggestions = [
    {
      icon: <Code2 className="w-5 h-5 text-indigo-400" />,
      title: "Code Architecture & Refactoring",
      description: "Design modular TypeScript components with robust error boundaries and clean abstractions.",
      prompt: "Help me design a clean, modular TypeScript architecture for a web application with proper state management and error handling.",
    },
    {
      icon: <Lightbulb className="w-5 h-5 text-amber-400" />,
      title: "Algorithm Optimization",
      description: "Analyze code performance, time complexity, and memory overhead with actionable benchmarks.",
      prompt: "Explain how to optimize array filtering and data processing for zero lag in React applications.",
    },
    {
      icon: <FileText className="w-5 h-5 text-emerald-400" />,
      title: "Technical Writing & Docs",
      description: "Draft comprehensive API specifications, README guides, and architecture decision records.",
      prompt: "Draft a clean, professional API documentation template for RESTful and Streaming SSE endpoints.",
    },
    {
      icon: <Compass className="w-5 h-5 text-cyan-400" />,
      title: "Problem Solving & Brainstorming",
      description: "Explore multiple engineering solutions with trade-off analysis and step-by-step guides.",
      prompt: "What are the best patterns for managing state and client-side caching in high-frequency real-time web apps?",
    },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto py-8 px-4 font-sans text-app-fg animate-in fade-in duration-300">
      {/* Hero Header */}
      <div className="text-center mb-8 space-y-3">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-mono font-medium shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
          <span>Generative AI Engine • Lag-Free High Throughput</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-app-fg tracking-tight">
          How can I help you build today?
        </h1>
        <p className="text-sm text-app-muted max-w-xl mx-auto leading-relaxed">
          Powered by <span className="text-app-fg font-semibold">{currentPreset.name}</span> ({modelName}) with streaming responses and Infinite Day 1 Context Memory.
        </p>
      </div>

      {/* Memory Status Banner */}
      <div className="bg-app-card border border-[#e2dcd0] rounded-2xl p-4 mb-6 shadow-sm flex items-start gap-3">
        <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 shrink-0 border border-indigo-100">
          <Brain className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-app-fg uppercase tracking-wider font-mono">
              Infinite Day 1 Memory Engine Active
            </h3>
            <span className="text-[10px] bg-indigo-50 text-indigo-700 font-mono px-2 py-0.5 rounded-full border border-indigo-200">
              Zero Context Loss
            </span>
          </div>
          <p className="text-xs text-app-muted mt-1 leading-relaxed">
            {longTermMemory
              ? "Long-term memory synchronized. Key facts and context from past sessions are automatically preserved without causing token lag."
              : "Conversations are automatically condensed in the background to preserve history from Day 1 to present without degrading streaming performance."}
          </p>
        </div>
      </div>

      {/* API Key Missing Alert */}
      {!hasApiKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-900 shadow-xs">
          <div className="flex items-center gap-2.5">
            <Key className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <span className="font-semibold text-app-fg">API Key or Base URL required</span>
              <p className="text-amber-800 text-[11px]">Configure your custom endpoint, OpenAI, Gemini, or Ollama in settings.</p>
            </div>
          </div>
          <button
            onClick={onOpenConfig}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold shrink-0 transition-colors shadow-xs"
          >
            Configure API
          </button>
        </div>
      )}

      {/* Prompt Suggestions Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-app-muted font-mono font-semibold uppercase tracking-wider px-1">
          <span>Suggested Conversations</span>
          <span className="text-[10px] text-app-muted">Click any card to start</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {promptSuggestions.map((item, idx) => (
            <button
              key={idx}
              onClick={() => onSendSuggestedPrompt(item.prompt)}
              className="text-left bg-app-card hover:bg-app-bg border border-[#e2dcd0] hover:border-indigo-400/80 rounded-2xl p-4 transition-all duration-200 group flex flex-col justify-between space-y-3 shadow-xs hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="p-2 rounded-xl bg-stone-100 group-hover:bg-indigo-50 transition-colors border border-app-border/60">
                  {item.icon}
                </div>
                <ArrowRight className="w-4 h-4 text-app-muted group-hover:text-indigo-600 transition-colors" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-app-fg group-hover:text-app-fg mb-1">
                  {item.title}
                </h4>
                <p className="text-[11px] text-app-muted leading-relaxed line-clamp-2">
                  {item.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Provider Quick Switch Pill Row */}
      <div className="mt-8 pt-6 border-t border-[#e2dcd0]">
        <div className="flex items-center justify-between mb-3 text-xs text-app-muted font-mono font-semibold uppercase tracking-wider">
          <span>Supported Endpoints</span>
          <button onClick={onOpenConfig} className="text-indigo-600 hover:underline text-[11px] font-sans">
            Customize All
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {PROVIDER_PRESETS.map((p) => {
            const isSelected = p.id === currentProvider;
            return (
              <button
                key={p.id}
                onClick={() => onSelectPreset(p.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium font-mono transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                    : "bg-app-card border border-[#e2dcd0] text-app-muted hover:text-app-fg hover:border-stone-400 shadow-2xs"
                }`}
              >
                <span>{p.name}</span>
                {isSelected && <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
