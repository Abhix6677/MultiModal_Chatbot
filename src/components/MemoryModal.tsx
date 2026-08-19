import React, { useState, useEffect } from "react";
import { X, Brain, RefreshCw, Trash2, CheckCircle2, Sparkles } from "lucide-react";
import { Conversation, ApiConfig } from "../types";
import { updateConversationMemoryIfNeeded } from "../utils/memory";

interface MemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: Conversation;
  onUpdateMemory: (newMemory: string, newIndex?: number) => void;
  onForceEvolve?: () => void;
  config: ApiConfig;
}

export const MemoryModal: React.FC<MemoryModalProps> = ({
  isOpen,
  onClose,
  conversation,
  onUpdateMemory,
  onForceEvolve,
  config,
}) => {
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [memoryText, setMemoryText] = useState(conversation.longTermMemory || "");

  useEffect(() => {
    if (isOpen) {
      setMemoryText(conversation.longTermMemory || "");
    }
  }, [conversation.longTermMemory, isOpen]);

  const totalMessages = conversation.messages.length;
  const backedUpMessages = Math.min(
    (conversation.lastSummarizedMessageIndex !== undefined && conversation.lastSummarizedMessageIndex > -1)
      ? conversation.lastSummarizedMessageIndex + 1
      : 0,
    totalMessages
  );

  if (!isOpen) return null;

  const handleManualSummarize = async () => {
    setIsSummarizing(true);
    const newMemory = await updateConversationMemoryIfNeeded(conversation, config, true);
    if (newMemory) {
      setMemoryText(newMemory);
      onUpdateMemory(newMemory, conversation.messages.length - 1);
    }
    if (onForceEvolve) {
      onForceEvolve();
    }
    setIsSummarizing(false);
  };

  const handleSave = () => {
    onUpdateMemory(memoryText);
    onClose();
  };

  const dayOneDate = new Date(conversation.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-md p-4 font-sans text-stone-800">
      <div className="relative w-full max-w-xl bg-app-card rounded-2xl shadow-2xl border border-app-border overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-app-border bg-app-surface">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-app-primary text-white dark:text-stone-900 flex items-center justify-center shadow-sm">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-app-fg tracking-tight">
                Infinite Long-Term Memory
              </h2>
              <p className="text-[11px] text-app-text-secondary font-mono">
                Facts &amp; Context remembered since Day 1 ({dayOneDate})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-app-muted hover:text-app-fg hover:bg-app-surface-hover rounded-xl transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 bg-app-card">
          <div className="p-3 bg-app-surface-active border border-app-border rounded-xl text-xs text-app-fg leading-relaxed flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-app-primary shrink-0 mt-0.5" />
            <div>
              <strong>Automatic Memory Sync Active:</strong> Condenses and preserves key facts when history exceeds <strong>{(() => {
                const w = config.condenseWordLimit || 100000;
                if (w >= 100000) return `${(w / 100000).toLocaleString()} Lakh words`;
                return `${w.toLocaleString()} words`;
              })()}</strong> (customizable in Settings). Day 1 origin is preserved forever without causing chat lag.
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-app-text-secondary uppercase tracking-wider mb-2 font-mono">
              Remembered Knowledge &amp; History
            </label>
            <textarea
              value={memoryText}
              onChange={(e) => setMemoryText(e.target.value)}
              placeholder="e.g. User's name is Alex. Discussed building a weather forecasting app on Day 1. Prefers TypeScript and Tailwind CSS..."
              rows={8}
              className="w-full p-3.5 bg-app-input-bg border border-app-border rounded-xl text-xs text-app-input-text placeholder-app-input-placeholder font-mono focus:outline-none no-focus-ring focus:border-app-primary leading-relaxed transition-colors"
            />
          </div>

          {/* Status and Action buttons */}
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex items-center justify-between px-1">
              <div className="text-[11px] font-mono text-app-text-secondary flex items-center gap-2">
                <span className="px-2 py-0.5 bg-app-surface-active border border-app-border rounded-md font-bold text-app-fg">
                  {backedUpMessages}/{totalMessages}
                </span>
                <span>Messages fully condensed &amp; stored</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleManualSummarize}
                disabled={isSummarizing || conversation.messages.length === 0}
                className="px-3.5 py-2 bg-app-surface hover:bg-app-surface-hover text-app-fg text-xs font-mono rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50 border border-app-border cursor-pointer disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSummarizing ? "animate-spin" : ""}`} />
                {isSummarizing ? "Extracting..." : "Force Self-Reflection (Learn Rules)"}
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMemoryText("");
                    onUpdateMemory("");
                  }}
                  className="px-3.5 py-2 text-[#A7AFBC] hover:text-red-400 hover:bg-red-500/10 text-xs font-medium rounded-xl transition-colors"
                >
                  Clear Memory
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-4 py-2 bg-app-primary hover:bg-app-primary-hover text-white dark:text-stone-900 text-xs font-semibold rounded-xl transition-all shadow-none hover:shadow-md cursor-pointer"
                >
                  Save Memory
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};