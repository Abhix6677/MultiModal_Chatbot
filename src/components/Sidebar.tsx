import React, { useState } from "react";
import {
  Plus,
  MessageSquare,
  Trash2,
  Sliders,
  Download,
  Upload,
  Bot,
  ChevronLeft,
  Search,
  Check,
  Edit2,
  Brain,
} from "lucide-react";
import { Conversation, ApiConfig } from "../types";
import { PROVIDER_PRESETS } from "../data/providers";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  currentConversationId: string;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onClearAll: () => void;
  onOpenConfig: () => void;
  config: ApiConfig;
  onImportConversations: (imported: Conversation[]) => void;
  onOpenMemory: () => void;
  onOpenEvolution: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onRenameConversation,
  onClearAll,
  onOpenConfig,
  config,
  onImportConversations,
  onOpenMemory,
  onOpenEvolution,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const providerPreset =
    PROVIDER_PRESETS.find((p) => p.id === config.provider) || PROVIDER_PRESETS[0];

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleStartRename = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const handleSaveRename = (id: string, e: React.FormEvent) => {
    e.preventDefault();
    if (editTitle.trim()) {
      onRenameConversation(id, editTitle.trim());
    }
    setEditingId(null);
  };



  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-30 lg:hidden"
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-72 bg-app-sidebar text-app-muted flex flex-col transition-transform duration-300 ease-in-out border-r border-app-border ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Top Header */}
        <div className="p-4 border-b border-app-border flex items-center justify-between bg-app-bg">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-app-primary text-white flex items-center justify-center font-bold text-sm shadow-sm shadow-indigo-600/30">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-sm text-app-muted tracking-tight">
                AI Chatbot
              </h1>
              <span className="text-[10px] text-app-text-secondary font-mono block">
                Infinite Day 1 Memory
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-app-text-secondary hover:text-app-muted rounded-lg lg:hidden"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-3 space-y-2">
          <button
            id="new-chat-sidebar-btn"
            onClick={() => {
              onNewConversation();
              if (window.innerWidth < 1024) onClose();
            }}
            className="w-full py-2.5 px-4 bg-app-primary hover:bg-indigo-500 text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 transition-all"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" /> New Chat
          </button>
        </div>

        {/* Config & Memory quick access */}
        <div className="px-3 py-1 space-y-1.5">
          <div className="p-2.5 rounded-xl bg-app-surface border border-app-border flex items-center justify-between shadow-xs">
            <div className="overflow-hidden pr-2">
              <div className="text-[10px] text-indigo-600 font-semibold uppercase tracking-wider">
                Active Model
              </div>
              <div className="text-xs font-semibold text-app-muted truncate">
                {config.model}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={onOpenMemory}
                className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors border border-indigo-200"
                title="View Long-Term Memory"
              >
                <Brain className="w-3.5 h-3.5" />
              </button>
              <button
                id="sidebar-config-btn"
                onClick={onOpenConfig}
                className="p-1.5 bg-app-border hover:bg-app-surface-hover text-app-text-secondary rounded-lg transition-colors border border-stone-300/80"
                title="API Settings"
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-3 py-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-app-muted group-hover:text-app-fg" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-app-surface border border-app-border rounded-xl text-xs text-app-muted placeholder-app-text-disabled focus:outline-none focus:border-app-primary"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-8 text-app-muted group-hover:text-app-fg text-xs font-mono">
              No chats found.
            </div>
          ) : (
            filteredConversations.map((chat) => {
              const isActive = chat.id === currentConversationId;
              const isEditingThis = editingId === chat.id;

              return (
                <div
                  key={chat.id}
                  onClick={() => {
                    onSelectConversation(chat.id);
                    if (window.innerWidth < 1024) onClose();
                  }}
                  className={`group relative flex items-center justify-between p-2.5 rounded-xl text-xs cursor-pointer transition-all ${
                    isActive
                      ? "bg-app-primary/15 border-l-2 border-app-primary text-app-muted shadow-xs font-semibold"
                      : "text-app-text-secondary border-l-2 border-transparent hover:bg-app-surface-hover hover:text-app-muted"
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden mr-2">
                    <MessageSquare
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? "text-app-primary" : "text-app-muted group-hover:text-app-fg"
                      }`}
                    />
                    {isEditingThis ? (
                      <form
                        onSubmit={(e) => handleSaveRename(chat.id, e)}
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="bg-app-surface px-2 py-0.5 rounded text-xs text-app-muted border border-indigo-500 focus:outline-none w-28"
                          autoFocus
                        />
                        <button type="submit" className="text-emerald-600 p-0.5">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    ) : (
                      <span className="truncate">{chat.title}</span>
                    )}
                  </div>

                  {!isEditingThis && (
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => handleStartRename(chat.id, chat.title, e)}
                        className={`p-1 transition-colors ${isActive ? "hover:text-white" : "hover:text-indigo-600"}`}
                        title="Rename"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteConversation(chat.id);
                        }}
                        className={`p-1 transition-colors ${isActive ? "hover:text-red-200" : "hover:text-red-600"}`}
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>


      </aside>
    </>
  );
};
