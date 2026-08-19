import React, { useState, useEffect, useCallback } from "react";
import {
  X, Cpu, Zap, Search, History, FlaskConical, AlertTriangle,
  RotateCcw, Pause, Play, Trash2, Check, ChevronDown, ChevronUp,
  Shield, MessageSquare, Code2, BookOpen, Workflow, Languages,
} from "lucide-react";
import { ApiConfig, Conversation } from "../types";

// ─── Type mirrors from backendEvolution.ts (frontend read-only view) ──────────
interface BehaviorRule {
  id: string;
  category: string;
  context: string;
  rule: string;
  confidence: number;
  evidenceCount: number;
  status: "candidate" | "experimental" | "active" | "stale" | "superseded" | "rejected";
  source: string;
  createdAt: number;
  updatedAt: number;
  lastConfirmedAt: number;
  expiresAt?: number;
  interactionsRemainingBeforeExpiry?: number;
}

interface EvolutionEvent {
  version: number;
  timestamp: number;
  action: string;
  ruleId?: string;
  summary: string;
  evidence: string;
}

interface UserBehaviorModel {
  userId: string;
  version: number;
  rules: BehaviorRule[];
  evolutionHistory: EvolutionEvent[];
  lastEvolvedAt: number;
  pausedUntil?: number;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface EvolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ApiConfig;
  onUpdateConfig: (newConfig: Partial<ApiConfig>) => void;
  conversations: Conversation[];
}

// ─── Category Icons ───────────────────────────────────────────────────────────
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  communication: <MessageSquare className="w-3.5 h-3.5" />,
  tone: <MessageSquare className="w-3.5 h-3.5" />,
  formatting: <BookOpen className="w-3.5 h-3.5" />,
  language: <Languages className="w-3.5 h-3.5" />,
  coding: <Code2 className="w-3.5 h-3.5" />,
  workflow: <Workflow className="w-3.5 h-3.5" />,
  identity: <Shield className="w-3.5 h-3.5" />,
  other: <Cpu className="w-3.5 h-3.5" />,
};

const CONTEXT_COLORS: Record<string, string> = {
  "*": "bg-indigo-500/15 text-indigo-400",
  general: "bg-blue-500/15 text-blue-400",
  coding: "bg-emerald-500/15 text-emerald-400",
  debugging: "bg-orange-500/15 text-orange-400",
  exam: "bg-yellow-500/15 text-yellow-400",
  leetcode: "bg-pink-500/15 text-pink-400",
  creative: "bg-purple-500/15 text-purple-400",
};

const ACTION_COLORS: Record<string, string> = {
  ADD: "text-emerald-400",
  EXPERIMENT: "text-yellow-400",
  SUPERSEDE: "text-orange-400",
  ROLLBACK: "text-blue-400",
  NO_CHANGE: "text-muted-foreground",
  CONTRADICTION_RESOLVED: "text-purple-400",
  REMOVE: "text-red-400",
};

type TabId = "model" | "experiments" | "history" | "manual" | "controls";

// ─── Main Component ───────────────────────────────────────────────────────────
export const EvolutionModal: React.FC<EvolutionModalProps> = ({
  isOpen,
  onClose,
  config,
  onUpdateConfig,
  conversations,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>("model");
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [manualRules, setManualRules] = useState(config.globalSystemRules || "");
  const [model, setModel] = useState<UserBehaviorModel | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState(false);

  // Load model from backend
  const loadModel = useCallback(async () => {
    setIsLoadingModel(true);
    try {
      const res = await fetch("/api/evolution/model?userId=default_user");
      if (res.ok) {
        const data = await res.json();
        if (data.model) {
          setModel(data.model);
          const paused = !!(data.model.pausedUntil && data.model.pausedUntil > Date.now());
          setIsPaused(paused);
        }
      }
    } catch (e) {
      console.error("Failed to load behavior model", e);
    } finally {
      setIsLoadingModel(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadModel();
      setManualRules(config.globalSystemRules || "");
    }
  }, [isOpen, loadModel]);

  if (!isOpen) return null;

  // ── Run shadow evaluation ────────────────────────────────────────────────
  const handleEvaluate = async () => {
    setIsEvaluating(true);
    const recentConvs = conversations.slice(0, 5);
    const historyText = recentConvs.map(conv => {
      const msgs = conv.messages.slice(-10).map(m => `${m.role.toUpperCase()}: ${m.content.substring(0, 500)}`).join("\n");
      return `--- CHAT: ${conv.title} ---\n${msgs}`;
    }).join("\n\n");

    try {
      const res = await fetch("/api/shadow-evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          historyText,
          userId: "default_user",
          globalSystemRules: config.globalSystemRules || "",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.rules && typeof data.rules === "string" && data.rules.trim()) {
          onUpdateConfig({ globalSystemRules: data.rules });
          setManualRules(data.rules);
        }
        await loadModel();
      }
    } catch (err) {
      console.error("Evaluation failed", err);
    } finally {
      setIsEvaluating(false);
    }
  };

  // ── Rollback ─────────────────────────────────────────────────────────────
  const handleRollback = async () => {
    setIsRollingBack(true);
    try {
      const res = await fetch("/api/evolution/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "default_user" }),
      });
      if (res.ok) {
        await loadModel();
      }
    } catch (err) {
      console.error("Rollback failed", err);
    } finally {
      setIsRollingBack(false);
    }
  };

  // ── Pause / Resume ───────────────────────────────────────────────────────
  const handlePauseToggle = async () => {
    try {
      await fetch("/api/evolution/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "default_user", pause: !isPaused }),
      });
      setIsPaused(!isPaused);
    } catch (err) {
      console.error("Pause toggle failed", err);
    }
  };

  // ── Promote / Reject rule ────────────────────────────────────────────────
  const handleRuleAction = async (ruleId: string, action: "promote" | "reject" | "delete") => {
    try {
      await fetch(`/api/evolution/rule/${ruleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "default_user", action }),
      });
      await loadModel();
    } catch (err) {
      console.error("Rule action failed", err);
    }
  };

  const handleSaveManual = () => {
    onUpdateConfig({ globalSystemRules: manualRules });
    onClose();
  };

  // ── Derived data ─────────────────────────────────────────────────────────
  const activeRules = model?.rules.filter(r => r.status === "active") || [];
  const experimentalRules = model?.rules.filter(r => r.status === "experimental") || [];
  const rulesByCategory = activeRules.reduce<Record<string, BehaviorRule[]>>((acc, r) => {
    acc[r.category] = acc[r.category] || [];
    acc[r.category].push(r);
    return acc;
  }, {});
  const historyToShow = expandedHistory
    ? (model?.evolutionHistory || [])
    : (model?.evolutionHistory || []).slice(0, 6);

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "model", label: "Learned Rules", count: activeRules.length },
    { id: "experiments", label: "Experiments", count: experimentalRules.length },
    { id: "history", label: "History", count: model?.version },
    { id: "manual", label: "Manual" },
    { id: "controls", label: "Controls" },
  ];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 font-sans text-foreground">
      <div className="relative w-full max-w-2xl bg-card rounded-2xl shadow-2xl border overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/30 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500 text-white flex items-center justify-center shadow-sm">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground tracking-tight">AI Evolution Hub</h2>
              <p className="text-[11px] text-muted-foreground font-mono">
                v{model?.version ?? 0} · {activeRules.length} active rules
                {isPaused && <span className="ml-2 text-yellow-500">⏸ Paused</span>}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-background rounded-xl transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b bg-muted/20 shrink-0 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? "text-purple-400 border-b-2 border-purple-500 bg-background/50"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  activeTab === tab.id ? "bg-purple-500/20 text-purple-400" : "bg-muted text-muted-foreground"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── Learned Rules Tab ── */}
          {activeTab === "model" && (
            <div className="space-y-4">
              {isLoadingModel ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground text-xs">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-500 mr-2" />
                  Loading behavior model...
                </div>
              ) : activeRules.length === 0 ? (
                <div className="p-4 bg-muted/30 rounded-xl text-xs text-muted-foreground text-center space-y-2">
                  <Cpu className="w-8 h-8 mx-auto text-muted-foreground/50" />
                  <p>No rules learned yet.</p>
                  <p className="text-[10px]">Run Shadow Evaluation or chat more to let the AI learn your preferences.</p>
                </div>
              ) : (
                Object.entries(rulesByCategory).map(([category, rules]) => (
                  <div key={category} className="space-y-1.5">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest font-mono">
                      {CATEGORY_ICONS[category] || <Cpu className="w-3.5 h-3.5" />}
                      {category}
                    </div>
                    <div className="space-y-1.5">
                      {rules.map(rule => (
                        <div key={rule.id} className="flex items-start gap-3 p-3 bg-background/60 border rounded-xl hover:bg-background transition-colors group">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground leading-relaxed">{rule.rule}</p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${CONTEXT_COLORS[rule.context] || CONTEXT_COLORS["*"]}`}>
                                {rule.context === "*" ? "universal" : rule.context}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {Math.round(rule.confidence * 100)}% confidence
                              </span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {rule.evidenceCount} signals
                              </span>
                              {rule.interactionsRemainingBeforeExpiry !== undefined && (
                                <span className="text-[10px] text-yellow-500 font-mono">
                                  ⏳ expires in {rule.interactionsRemainingBeforeExpiry} turns
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleRuleAction(rule.id, "delete")}
                            className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-400 rounded-lg transition-all shrink-0"
                            title="Delete rule"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Experiments Tab ── */}
          {activeTab === "experiments" && (
            <div className="space-y-3">
              {experimentalRules.length === 0 ? (
                <div className="p-4 bg-muted/30 rounded-xl text-xs text-muted-foreground text-center space-y-1">
                  <FlaskConical className="w-8 h-8 mx-auto text-muted-foreground/50" />
                  <p>No experiments running.</p>
                  <p className="text-[10px]">Low-confidence signals are tested here before becoming permanent rules.</p>
                </div>
              ) : (
                <>
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-xs text-yellow-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>These rules are being tested. Accept to make them permanent, or reject to discard.</span>
                  </div>
                  {experimentalRules.map(rule => (
                    <div key={rule.id} className="p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl space-y-2">
                      <p className="text-xs text-foreground leading-relaxed">{rule.rule}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${CONTEXT_COLORS[rule.context] || CONTEXT_COLORS["*"]}`}>
                            {rule.context === "*" ? "universal" : rule.context}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {Math.round(rule.confidence * 100)}% confidence
                          </span>
                          {rule.interactionsRemainingBeforeExpiry !== undefined && (
                            <span className="text-[10px] text-yellow-500 font-mono">
                              {rule.interactionsRemainingBeforeExpiry} turns left
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRuleAction(rule.id, "reject")}
                            className="px-2.5 py-1 text-[10px] font-medium text-red-400 hover:bg-red-500/10 rounded-lg transition-colors border border-red-500/20"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => handleRuleAction(rule.id, "promote")}
                            className="px-2.5 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors border border-emerald-500/20 flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" /> Accept
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ── History Tab ── */}
          {activeTab === "history" && (
            <div className="space-y-2">
              {(!model?.evolutionHistory || model.evolutionHistory.length === 0) ? (
                <div className="p-4 bg-muted/30 rounded-xl text-xs text-muted-foreground text-center space-y-1">
                  <History className="w-8 h-8 mx-auto text-muted-foreground/50" />
                  <p>No evolution history yet.</p>
                </div>
              ) : (
                <>
                  {historyToShow.map((event, i) => (
                    <div key={i} className="flex gap-3 p-3 bg-background/50 border rounded-xl">
                      <div className="shrink-0 w-5 text-[10px] font-mono text-muted-foreground/60 pt-0.5">
                        v{event.version}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-[10px] font-mono font-bold ${ACTION_COLORS[event.action] || "text-muted-foreground"}`}>
                            {event.action}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {new Date(event.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-xs text-foreground leading-snug">{event.summary}</p>
                        {event.evidence && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 italic">{event.evidence}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {(model?.evolutionHistory?.length || 0) > 6 && (
                    <button
                      onClick={() => setExpandedHistory(!expandedHistory)}
                      className="w-full text-xs text-muted-foreground hover:text-foreground py-2 flex items-center justify-center gap-1 transition-colors"
                    >
                      {expandedHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {expandedHistory ? "Show less" : `Show ${(model?.evolutionHistory?.length || 0) - 6} more`}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Manual Override Tab ── */}
          {activeTab === "manual" && (
            <div className="space-y-3">
              <div className="p-3 bg-accent border rounded-xl text-xs text-foreground leading-relaxed flex items-start gap-2.5">
                <Search className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                <div>
                  <strong>Manual Override:</strong> Edit the raw behavior rules string directly. These rules are injected into every chat. The AI Evolution engine builds on top of these.
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 font-mono">
                  Global Behavior Rules
                </label>
                <textarea
                  value={manualRules}
                  onChange={(e) => setManualRules(e.target.value)}
                  placeholder="e.g. Always respond concisely. Never use apologies. Prefer vanilla CSS..."
                  rows={10}
                  className="w-full p-3.5 bg-background border rounded-xl text-xs text-foreground placeholder:text-muted-foreground font-mono focus:outline-none focus:border-purple-500 leading-relaxed transition-colors"
                />
              </div>
            </div>
          )}

          {/* ── Controls Tab ── */}
          {activeTab === "controls" && (
            <div className="space-y-3">
              <div className="p-4 bg-background/60 border rounded-xl space-y-3">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Evolution Engine</h3>
                <div className="space-y-2">
                  <button
                    onClick={handleEvaluate}
                    disabled={isEvaluating || isPaused}
                    className="w-full px-4 py-2.5 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    <Zap className={`w-3.5 h-3.5 ${isEvaluating ? "animate-pulse" : ""}`} />
                    {isEvaluating ? "Evaluating..." : "Run Shadow Evaluation Now"}
                  </button>
                  <button
                    onClick={handleRollback}
                    disabled={isRollingBack || !model?.evolutionHistory?.length}
                    className="w-full px-4 py-2.5 bg-muted/50 hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed text-foreground text-xs font-medium rounded-xl flex items-center justify-center gap-2 transition-all border"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${isRollingBack ? "animate-spin" : ""}`} />
                    {isRollingBack ? "Rolling back..." : "Rollback Last Change"}
                  </button>
                  <button
                    onClick={handlePauseToggle}
                    className="w-full px-4 py-2.5 bg-muted/50 hover:bg-accent text-foreground text-xs font-medium rounded-xl flex items-center justify-center gap-2 transition-all border"
                  >
                    {isPaused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5 text-yellow-400" />}
                    {isPaused ? "Resume Auto-Evolution" : "Pause Auto-Evolution (24h)"}
                  </button>
                </div>
              </div>

              <div className="p-3 bg-muted/20 border rounded-xl space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Model Version</span>
                  <span className="font-mono">v{model?.version ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Active Rules</span>
                  <span className="font-mono">{activeRules.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Experiments</span>
                  <span className="font-mono">{experimentalRules.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Evolved</span>
                  <span className="font-mono">
                    {model?.lastEvolvedAt ? new Date(model.lastEvolvedAt).toLocaleTimeString() : "Never"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Auto-Evolution</span>
                  <span className={`font-mono ${isPaused ? "text-yellow-500" : "text-emerald-500"}`}>
                    {isPaused ? "Paused" : "Active"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t bg-muted/20 shrink-0">
          <button
            onClick={handleEvaluate}
            disabled={isEvaluating || isPaused}
            className="px-3.5 py-2 bg-muted/50 hover:bg-accent text-foreground text-xs font-mono rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50 border cursor-pointer disabled:cursor-not-allowed"
          >
            <Zap className={`w-3.5 h-3.5 ${isEvaluating ? "animate-pulse text-purple-500" : ""}`} />
            {isEvaluating ? "Evaluating..." : "Quick Evaluate"}
          </button>

          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
              Close
            </button>
            {activeTab === "manual" && (
              <button
                onClick={handleSaveManual}
                className="px-5 py-2 bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95"
              >
                Save Rules
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
