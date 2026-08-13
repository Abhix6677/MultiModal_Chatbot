import React, { useState } from "react";
import { X, Cpu, Zap, Search } from "lucide-react";
import { ApiConfig, Conversation } from "../types";

interface EvolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ApiConfig;
  onUpdateConfig: (newConfig: Partial<ApiConfig>) => void;
  conversations: Conversation[];
}

export const EvolutionModal: React.FC<EvolutionModalProps> = ({
  isOpen,
  onClose,
  config,
  onUpdateConfig,
  conversations,
}) => {
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [rules, setRules] = useState(config.globalSystemRules || "");

  if (!isOpen) return null;

  const handleEvaluate = async () => {
    setIsEvaluating(true);
    
    // Collect recent messages from the most recent chats
    const recentConvs = conversations.slice(0, 5); // Take up to 5 recent chats
    const historyText = recentConvs.map(conv => {
      const msgs = conv.messages.slice(-10).map(m => {
        const role = m.role.toUpperCase();
        return `${role}: ${m.content.substring(0, 500)}`;
      }).join("\n");
      return `--- CHAT: ${conv.title} ---\n${msgs}`;
    }).join("\n\n");

    try {
      const res = await fetch("/api/shadow-evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: config.provider,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: config.model,
          historyText,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.rules) {
          if (data.rules.trim() === "NO_CHANGE") {
            setRules("Not enough meaningful conversation history to generate new personalized rules yet. Chat more and try again!");
          } else {
            setRules(data.rules);
          }
        }
      }
    } catch (err) {
      console.error("Evaluation failed", err);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleSave = () => {
    onUpdateConfig({ globalSystemRules: rules });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-md p-4 font-sans text-stone-800">
      <div className="relative w-full max-w-xl bg-app-card rounded-2xl shadow-2xl border border-app-border overflow-hidden my-8">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-app-border bg-app-surface">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500 text-white flex items-center justify-center shadow-sm">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-app-fg tracking-tight">
                AI Evolution Hub (Layer 4)
              </h2>
              <p className="text-[11px] text-app-text-secondary font-mono">
                Shadow Evaluation & Auto-Prompt Optimization
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-app-muted hover:text-app-fg hover:bg-app-surface-hover rounded-xl transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 bg-app-card">
          <div className="p-3 bg-app-surface-active border border-app-border rounded-xl text-xs text-app-fg leading-relaxed flex items-start gap-2.5">
            <Search className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
            <div>
              <strong>Shadow Evaluation:</strong> The AI will analyze your recent conversations, identify your preferences, and auto-generate permanent behavior rules to improve user experience.
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-app-text-secondary uppercase tracking-wider mb-2 font-mono">
              Global Shadow Evaluation Persona
            </label>
            <textarea
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              placeholder="e.g. Always respond concisely. Never use apologies. Prefer dark mode code blocks..."
              rows={8}
              className="w-full p-3.5 bg-app-input-bg border border-app-border rounded-xl text-xs text-app-input-text placeholder-app-input-placeholder font-mono focus:outline-none no-focus-ring focus:border-purple-500 leading-relaxed transition-colors"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleEvaluate}
              disabled={isEvaluating}
              className="px-3.5 py-2 bg-app-surface hover:bg-app-surface-hover text-app-fg text-xs font-mono rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50 border border-app-border cursor-pointer disabled:cursor-not-allowed"
            >
              <Zap className={`w-3.5 h-3.5 ${isEvaluating ? "animate-pulse text-purple-500" : ""}`} />
              {isEvaluating ? "Evaluating..." : "Run Shadow Evaluation"}
            </button>

            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-app-muted hover:text-app-fg transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-5 py-2 bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95"
              >
                Save & Apply Rules
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
