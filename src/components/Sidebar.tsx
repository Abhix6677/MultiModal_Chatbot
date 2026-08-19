import React, { useState } from "react";
import {
  Plus,
  MessageSquare,
  Trash2,
  Sliders,
  Bot,
  ChevronLeft,
  Search,
  Check,
  Edit2,
  Brain,
  MessageCircle,
  Pin,
  PinOff,
  X,
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
  onTogglePinConversation?: (id: string) => void;
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
  onOpenMemory,
  onOpenEvolution,
  onTogglePinConversation,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sortedConversations = [...conversations].sort(
    (a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)
  );

  const filteredConversations = sortedConversations.filter((c) =>
    c.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pinnedConversations = filteredConversations.filter(c => c.pinned);
  const unpinnedConversations = filteredConversations.filter(c => !c.pinned);

  const handleStartRename = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(currentTitle);
    setDeletingId(null);
  };

  const handleSaveRename = (id: string, e: React.FormEvent) => {
    e.preventDefault();
    if (editTitle.trim()) {
      onRenameConversation(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  
  const grouped = {
    today: [] as Conversation[],
    yesterday: [] as Conversation[],
    last7Days: [] as Conversation[],
    older: [] as Conversation[]
  };

  unpinnedConversations.forEach(c => {
    const timestamp = c.updatedAt || c.createdAt || now;
    const diff = now - timestamp;
    if (diff < day) grouped.today.push(c);
    else if (diff < 2 * day) grouped.yesterday.push(c);
    else if (diff < 7 * day) grouped.last7Days.push(c);
    else grouped.older.push(c);
  });

  const renderGroup = (title: string, list: Conversation[]) => {
    if (list.length === 0) return null;
    return (
      <div className="mb-4">
        <h3 className="px-3 text-xs font-semibold text-muted-foreground mb-1">{title}</h3>
        <div className="space-y-0.5">
          {list.map((chat) => {
            const isActive = chat.id === currentConversationId;
            const isEditingThis = editingId === chat.id;
            const isDeletingThis = deletingId === chat.id;

            return (
              <div
                key={chat.id}
                onClick={() => {
                  onSelectConversation(chat.id);
                  if (window.innerWidth < 1024) onClose();
                }}
                className={`group relative flex items-center justify-between px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
                }`}
              >
                <div className="flex items-center gap-2 overflow-hidden mr-2">
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
                        className="bg-background px-2 py-0.5 rounded text-sm border focus:outline-none w-32"
                        autoFocus
                      />
                      <button type="submit" className="text-primary p-0.5">
                        <Check className="w-4 h-4" />
                      </button>
                    </form>
                  ) : (
                    <span className="truncate">{chat.title}</span>
                  )}
                </div>

                {!isEditingThis && (
                  <div className={`flex items-center shrink-0 ${!isActive && !chat.pinned ? 'opacity-0 group-hover:opacity-100' : ''}`}>
                    {isDeletingThis ? (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteConversation(chat.id);
                            setDeletingId(null);
                          }}
                          className={`p-1 transition-colors text-destructive hover:text-red-600`}
                          title="Confirm Delete"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(null);
                          }}
                          className={`p-1 transition-colors hover:text-foreground`}
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        {onTogglePinConversation && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onTogglePinConversation(chat.id);
                            }}
                            className={`p-1 transition-colors hover:text-foreground ${chat.pinned ? 'text-primary opacity-100' : ''}`}
                            title={chat.pinned ? "Unpin" : "Pin"}
                          >
                            {chat.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <button
                          onClick={(e) => handleStartRename(chat.id, chat.title, e)}
                          className={`p-1 transition-colors hover:text-foreground`}
                          title="Rename"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(chat.id);
                          }}
                          className={`p-1 transition-colors hover:text-destructive`}
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 lg:hidden"
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-300 ease-in-out border-r ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Top Header */}
        <div className="h-14 border-b flex items-center justify-between px-4">
          <div className="flex items-center gap-2 font-semibold">
            <Bot className="w-5 h-5 text-primary" />
            <span>Chatbot</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:bg-accent rounded-md lg:hidden transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
        
        {/* New Chat Button */}
        <div className="p-4 border-b">
          <button
            onClick={() => {
              onNewConversation();
              if (window.innerWidth < 1024) onClose();
            }}
            className="w-full flex items-center justify-between py-2 px-3 bg-background hover:bg-accent border shadow-sm rounded-md text-sm font-medium transition-colors"
          >
            <span>New Chat</span>
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Search bar */}
        <div className="p-4 pb-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-background border rounded-md text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No chats found.
            </div>
          ) : (
            <>
              {renderGroup("Pinned", pinnedConversations)}
              {renderGroup("Today", grouped.today)}
              {renderGroup("Yesterday", grouped.yesterday)}
              {renderGroup("Previous 7 Days", grouped.last7Days)}
              {renderGroup("Older", grouped.older)}
            </>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="p-3 border-t bg-sidebar mt-auto flex flex-col gap-1">
          <button
            onClick={onOpenMemory}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent rounded-md transition-colors"
          >
            <Brain className="w-4 h-4" />
            <span>Memory</span>
          </button>
          <button
            onClick={onOpenConfig}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent rounded-md transition-colors"
          >
            <Sliders className="w-4 h-4" />
            <span>Settings</span>
          </button>
        </div>
      </aside>
    </>
  );
};
