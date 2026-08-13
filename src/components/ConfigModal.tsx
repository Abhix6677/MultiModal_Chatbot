import React, { useState, useEffect } from "react";
import {
  X,
  Key,
  Globe,
  Cpu,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Sparkles,
  Bot,
  BrainCircuit,
  Zap,
  HardDrive,
  Server,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { ApiConfig, ProviderType } from "../types";
import { PROVIDER_PRESETS } from "../data/providers";

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ApiConfig;
  onSave: (newConfig: ApiConfig) => void;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
}) => {
  const [formData, setFormData] = useState<ApiConfig>(config);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [healthCheckedModels, setHealthCheckedModels] = useState<string[]>([]);
  const [allConfiguredModels, setAllConfiguredModels] = useState<string[]>([]);
  const [isHealthCheckEnabled, setIsHealthCheckEnabled] = useState(false);

  useEffect(() => {
    setFormData(config);
    setTestResult(null);

    if (isOpen) {
      const fetchModels = () => {
        fetch("/api/active-models")
          .then(res => res.json())
          .then(data => {
            setIsHealthCheckEnabled(data.isEnabled);
            setHealthCheckedModels(data.activeModels || []);
            setAllConfiguredModels(data.allModels || []);
          })
          .catch(err => console.error("Failed to fetch active models", err));
      };
      
      // Fetch immediately, then every 3 seconds
      fetchModels();
      const interval = setInterval(fetchModels, 3000);
      return () => clearInterval(interval);
    }
  }, [config, isOpen]);

  if (!isOpen) return null;

  const currentPreset = PROVIDER_PRESETS.find((p) => p.id === formData.provider) || PROVIDER_PRESETS[0];

  const handleProviderChange = (providerId: ProviderType) => {
    const preset = PROVIDER_PRESETS.find((p) => p.id === providerId);
    if (preset) {
      setFormData((prev) => ({
        ...prev,
        provider: providerId,
        baseUrl: preset.defaultBaseUrl,
        model: preset.defaultModel,
      }));
      setTestResult(null);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: formData.provider,
          baseUrl: formData.baseUrl,
          apiKey: formData.apiKey,
          model: formData.model,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: data.message || "Successfully connected to endpoint!",
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || "Failed to establish connection.",
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || "Network error while reaching server.",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  const renderProviderIcon = (iconName: string) => {
    switch (iconName) {
      case "Sparkles":
        return <Sparkles className="w-4 h-4" />;
      case "Bot":
        return <Bot className="w-4 h-4" />;
      case "BrainCircuit":
        return <BrainCircuit className="w-4 h-4" />;
      case "Zap":
        return <Zap className="w-4 h-4" />;
      case "HardDrive":
        return <HardDrive className="w-4 h-4" />;
      case "Server":
        return <Server className="w-4 h-4" />;
      default:
        return <Globe className="w-4 h-4" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4 overflow-y-auto font-sans text-app-fg">
      <div
        id="config-modal-card"
        className="relative w-full max-w-2xl bg-app-card rounded-2xl shadow-2xl border border-app-border overflow-hidden my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-app-border bg-app-sidebar">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-app-primary text-white flex items-center justify-center shadow-sm ">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-app-fg tracking-tight">API &amp; Endpoint Settings</h2>
              <p className="text-[11px] text-app-muted font-mono">
                Configure your API key, base URL, and provider settings
              </p>
            </div>
          </div>
          <button
            id="close-config-modal-btn"
            onClick={onClose}
            className="p-1.5 text-app-muted hover:text-app-fg hover:bg-app-bg hover:brightness-95 rounded-xl transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5 bg-app-card">
          {/* Provider Selection Grid */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-app-muted mb-2 font-mono">
              1. Selected Endpoint Preset
            </label>
            <div className="grid grid-cols-1 gap-2">
              {PROVIDER_PRESETS.map((preset) => {
                const isSelected = formData.provider === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    id={`provider-btn-${preset.id}`}
                    onClick={() => handleProviderChange(preset.id)}
                    className={`flex items-start p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "border-indigo-600 bg-app-surface-active text-app-primary font-semibold shadow-2xs"
                        : "border-app-border hover:border-app-primary/50 bg-app-bg/50 text-app-fg"
                    }`}
                  >
                    <div
                      className={`p-2 rounded-xl mr-3 shrink-0 ${
                        isSelected
                          ? "bg-app-primary text-white shadow-xs"
                          : "bg-app-surface-hover text-app-muted"
                      }`}
                    >
                      {renderProviderIcon(preset.iconName)}
                    </div>
                    <div className="overflow-hidden">
                      <div className="text-xs font-bold text-app-fg">{preset.name}</div>
                      <div className="text-[11px] text-app-primary font-mono mt-0.5">
                        {preset.defaultBaseUrl}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-app-muted leading-relaxed">{currentPreset.description}</p>
          </div>

          {/* Form Fields Grid */}
          <div className="space-y-4 pt-3 border-t border-app-border">
            <label className="block text-xs font-bold uppercase tracking-wider text-app-muted font-mono">
              2. Endpoint &amp; Credentials
            </label>



            {/* Model Name */}
            <div className="relative">
              <label className="text-xs font-medium text-app-fg flex items-center gap-1.5 mb-1.5 font-mono">
                <Cpu className="w-3.5 h-3.5 text-app-muted" />
                Model Name
              </label>
              <div className="relative">
                <input
                  id="model-input"
                  type="text"
                  value={formData.model}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, model: e.target.value }))
                  }
                  onFocus={() => setShowModelDropdown(true)}
                  onBlur={() => setTimeout(() => setShowModelDropdown(false), 200)}
                  placeholder="Select or type model name"
                  className="w-full px-3.5 py-2.5 bg-app-bg border border-app-border rounded-xl text-xs text-app-fg placeholder-app-text-disabled focus:outline-none focus:border-indigo-500 font-mono transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-app-muted hover:text-app-fg"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </button>
              </div>
              
              {showModelDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-app-card border border-app-border rounded-xl shadow-lg max-h-[160px] overflow-y-auto">
                  {(() => {
                    const rawModelsList = allConfiguredModels.length > 0 ? allConfiguredModels : (currentPreset.popularModels || []);
                    const sortedModelsList = [...rawModelsList].sort((a, b) => {
                      if (!isHealthCheckEnabled) return 0;
                      const aOnline = healthCheckedModels.includes(a);
                      const bOnline = healthCheckedModels.includes(b);
                      if (aOnline && !bOnline) return -1;
                      if (!aOnline && bOnline) return 1;
                      return 0;
                    });

                    return sortedModelsList.map((modelOpt) => {
                      const isOnline = isHealthCheckEnabled ? healthCheckedModels.includes(modelOpt) : true;
                      return (
                        <button
                          key={modelOpt}
                          type="button"
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, model: modelOpt }));
                            setShowModelDropdown(false);
                          }}
                          className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs hover:bg-app-surface-hover font-mono transition-colors border-b border-app-border last:border-0"
                        >
                          <span className={isOnline ? "text-app-fg" : "text-app-muted line-through opacity-70"}>{modelOpt}</span>
                          {isHealthCheckEnabled && (
                            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.6)]' : 'bg-red-400 opacity-50'}`} title={isOnline ? "Online (Health Check Passed)" : "Offline (Failed to ping endpoints)"} />
                          )}
                        </button>
                      );
                    });
                  })()}
                  {allConfiguredModels.length === 0 && (currentPreset.popularModels || []).length === 0 && (
                    <div className="px-3.5 py-2.5 text-xs text-app-muted font-mono italic">
                      No models configured.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Theme Selector */}
            <div className="pt-3 border-t border-app-border">
              <label className="text-xs font-semibold text-app-fg flex items-center gap-1.5 font-mono mb-2.5">
                <Monitor className="w-3.5 h-3.5 text-app-primary" />
                Appearance Theme
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "light", label: "Light", icon: Sun },
                  { id: "dark", label: "Dark", icon: Moon },
                ].map((t) => {
                  const Icon = t.icon;
                  const currentTheme = (formData.theme && formData.theme !== "system") ? formData.theme : "dark";
                  const isSelected = currentTheme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, theme: t.id as any }))}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all ${
                        isSelected
                          ? "bg-app-primary border-app-primary text-white font-semibold shadow-2xs"
                          : "bg-app-bg border-app-border text-app-muted hover:text-app-fg hover:border-app-primary/50"
                      }`}
                    >
                      <Icon className="w-4 h-4 mb-1" />
                      <span className="text-[11px] font-mono">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Auto-Condense Limit Control (Words) */}
            <div className="pt-3 border-t border-app-border">
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-app-fg flex items-center gap-1.5 font-mono">
                  <BrainCircuit className="w-3.5 h-3.5 text-app-primary" />
                  Auto-Condense Limit (Word Count)
                </label>
                <span className="text-[11px] text-app-primary font-mono font-semibold">
                  {(() => {
                    const w = formData.condenseWordLimit || 100000;
                    if (w >= 100000) {
                      const lakh = (w / 100000).toLocaleString(undefined, { maximumFractionDigits: 2 });
                      return `≈ ${lakh} Lakh words`;
                    }
                    return `${w.toLocaleString()} words`;
                  })()}
                </span>
              </div>

              <div className="space-y-2.5">
                <input
                  id="condense-limit-word-input"
                  type="number"
                  min="1000"
                  step="1000"
                  value={formData.condenseWordLimit || 100000}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setFormData((prev) => ({
                      ...prev,
                      condenseWordLimit: isNaN(val) ? 100000 : val,
                    }));
                  }}
                  placeholder="e.g. 100000 for 1 Lakh words"
                  className="w-full px-3.5 py-2.5 bg-app-bg border border-app-border rounded-xl text-xs text-app-fg placeholder-app-text-disabled focus:outline-none focus:border-indigo-500 font-mono transition-colors"
                />

                {/* Quick Word Limit Presets */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: "1 Lakh (100k)", words: 100000 },
                    { label: "2.56 Lakh (256k)", words: 256000 },
                    { label: "10 Lakh (1M)", words: 1000000 },
                    { label: "256 Lakh (25.6M)", words: 25600000 },
                  ].map((preset) => (
                    <button
                      key={preset.words}
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, condenseWordLimit: preset.words }))
                      }
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-mono border transition-all ${
                        (formData.condenseWordLimit || 100000) === preset.words
                          ? "bg-app-primary border-app-primary text-white font-semibold shadow-2xs"
                          : "bg-app-bg border-app-border text-app-muted hover:text-app-fg hover:border-app-primary/50"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <p className="text-[11px] text-app-muted font-mono leading-relaxed">
                  Memory automatically condenses and saves key facts when total history exceeds your specified word threshold (e.g. 1 Lakh = 100,000 words, 256 Lakh = 25,600,000 words).
                </p>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end pt-3.5 border-t border-app-border">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                id="cancel-config-btn"
                onClick={onClose}
                className="px-3.5 py-2 text-app-muted hover:text-app-fg hover:bg-app-bg hover:brightness-95 rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                id="save-config-btn"
                className="px-4 py-2 bg-app-primary hover:bg-app-primary-hover shadow-none hover:shadow-md text-white rounded-xl text-xs font-semibold shadow-md  transition-all"
              >
                Save Settings &amp; Chat
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
