import React from "react";
import {
  Key,
  Globe,
  Sliders,
  Sparkles,
  Bot,
  BrainCircuit,
  Zap,
  CheckCircle,
  ArrowRight,
  ShieldCheck,
  Zap as QuickIcon,
} from "lucide-react";
import { PROVIDER_PRESETS } from "../data/providers";
import { ProviderType } from "../types";

interface QuickStartCardProps {
  onSelectPreset: (providerId: ProviderType) => void;
  onOpenConfig: () => void;
  currentProvider: ProviderType;
  hasApiKey: boolean;
}

export const QuickStartCard: React.FC<QuickStartCardProps> = ({
  onSelectPreset,
  onOpenConfig,
  currentProvider,
  hasApiKey,
}) => {
  return (
    <div className="w-full max-w-3xl mx-auto my-6 p-6 sm:p-8 bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 text-white rounded-3xl shadow-xl border border-indigo-500/20 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 px-3 py-1 bg-indigo-500/20 border border-indigo-400/30 rounded-full text-xs font-medium text-indigo-300">
            <Sparkles className="w-3.5 h-3.5" /> Ready for Chatting
          </div>
          {hasApiKey ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium bg-emerald-950/60 border border-emerald-500/30 px-3 py-1 rounded-full">
              <CheckCircle className="w-3.5 h-3.5" /> API Key Configured
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-amber-300 font-medium bg-amber-950/60 border border-amber-500/30 px-3 py-1 rounded-full">
              <Key className="w-3.5 h-3.5" /> Key Required
            </span>
          )}
        </div>

        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
            Universal AI Chatbot
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed max-w-xl">
            Choose your provider, enter your API key or Base URL, and start chatting instantly. Supports OpenAI, Gemini, Anthropic, DeepSeek, Groq, OpenRouter, and custom local endpoints!
          </p>
        </div>

        {/* Major presets list */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          {PROVIDER_PRESETS.slice(0, 4).map((preset) => (
            <button
              key={preset.id}
              onClick={() => {
                onSelectPreset(preset.id);
                onOpenConfig();
              }}
              className={`p-3.5 rounded-2xl border text-left transition-all group ${
                currentProvider === preset.id
                  ? "bg-indigo-600/40 border-indigo-400 text-white ring-2 ring-indigo-400/30"
                  : "bg-slate-800/60 hover:bg-slate-800 border-slate-700/80 text-slate-200"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">
                  {preset.name}
                </span>
                <ArrowRight className="w-3 h-3 text-slate-500 group-hover:text-indigo-300 transition-colors" />
              </div>
              <div className="text-[10px] text-slate-400 truncate font-mono">
                {preset.defaultModel}
              </div>
            </button>
          ))}
        </div>

        {/* Call to Action Button */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>Your API key is securely stored in local session and never saved on disk.</span>
          </div>
          <button
            id="quick-start-config-btn"
            onClick={onOpenConfig}
            className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all shrink-0"
          >
            <Sliders className="w-4 h-4" /> Open API Settings
          </button>
        </div>
      </div>
    </div>
  );
};
