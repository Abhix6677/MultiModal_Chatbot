import React, { useState, useEffect } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  MessageSquare,
  Copy,
  Check,
  RotateCcw,
  User,
  Bot,
  Clock,
  Sparkles,
  AlertTriangle,
  Pencil,
  Eye,
  EyeOff,
  Image as ImageIcon,
  FileArchive,
  Layers,
} from "lucide-react";
import { ChatMessage } from "../types";

const CodeCopyButton = ({ codeText }: { codeText: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className={`text-xs px-2 py-1 rounded transition-colors flex items-center gap-1.5 font-sans ${
        copied ? "text-emerald-400 bg-[#2D333B]" : "text-gray-400 hover:text-white hover:bg-[#2D333B]"
      }`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
};

export interface ChatMessageItemProps {
  message: ChatMessage;
  isLastAssistantMessage?: boolean;
  onRetry?: () => void;
  onQuote?: (text: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  providerName?: string;
  isStreaming?: boolean;
}

export const ChatMessageItem = React.memo(
  ({
    message,
    isLastAssistantMessage,
    onRetry,
    onEdit,
    providerName = "AI Assistant",
    isStreaming,
    onQuote,
  }: ChatMessageItemProps) => {
    const [copied, setCopied] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(message.content);
    const [showImageDetails, setShowImageDetails] = useState(false);

    const handleCopy = () => {
      navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    const handleSaveEdit = () => {
      if (editText.trim() && onEdit) {
        onEdit(message.id, editText.trim());
        setIsEditing(false);
      }
    };

    const isUser = message.role === "user";
    const isSystem = message.role === "system";

    if (isSystem) {
      return (
        <div className="flex justify-center my-3 font-mono">
          <div className="px-3.5 py-1.5 rounded-xl bg-app-bg border border-app-border text-app-muted text-xs flex items-center gap-2 max-w-lg truncate shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-app-primary shrink-0" />
            <span>System: {message.content}</span>
          </div>
        </div>
      );
    }

    return (
      <div
        id={`chat-message-${message.id}`}
        data-message-id={message.id}
        className={`group relative flex gap-3.5 p-4 rounded-2xl border transition-all duration-200 ${
          isUser
            ? "bg-app-user-bg ml-auto max-w-[760px] text-app-user-fg shadow-md border-transparent"
            : message.isError
            ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30 text-red-900 dark:text-red-200 w-full max-w-[820px] shadow-sm"
            : "bg-app-assistant-bg border-app-border text-app-fg w-full max-w-[820px] shadow-sm"
        }`}
      >
        {/* Avatar Badge */}
        <div
          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white font-medium text-xs shadow-xs ${
            isUser
              ? "bg-black/10 text-[#FFFFFF]"
              : message.isError
              ? "bg-red-600 text-white"
              : "bg-app-surface-hover border border-app-border text-app-primary"
          }`}
        >
          {isUser ? (
            <User className="w-4 h-4" />
          ) : message.isError ? (
            <AlertTriangle className="w-4 h-4 text-red-300" />
          ) : (
            <Bot className="w-4 h-4 text-app-primary" />
          )}
        </div>

        {/* Message Body Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold tracking-tight ${isUser ? "text-app-user-fg" : "text-app-fg"}`}>
                {isUser ? "You" : providerName}
              </span>
              {message.modelUsed && message.modelUsed !== providerName && !isUser && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-app-bg border border-app-border text-app-muted font-mono">
                  {message.modelUsed}
                </span>
              )}
              {message.responseTimeMs && (
                <span className={`text-[10px] flex items-center gap-1 font-mono ${isUser ? "text-app-text-secondary" : "text-app-muted"}`}>
                  <Clock className="w-3 h-3" />
                  {(message.responseTimeMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>

            {/* Message Action Bar */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              {isUser && !isEditing && onEdit && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1 text-app-text-secondary hover:text-white hover:bg-indigo-700 rounded-lg transition-colors"
                  title="Edit message"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={handleCopy}
                className={`p-1 rounded-lg transition-colors ${
                  isUser
                    ? "text-app-text-secondary hover:text-white hover:bg-indigo-700"
                    : "text-app-muted hover:text-app-fg hover:bg-app-bg"
                }`}
                title="Copy message"
              >
                {copied ? (
                  <span className={`flex items-center gap-1 px-1 text-xs ${isUser ? "text-emerald-300" : "text-emerald-600"}`}>
                    <Check className="w-3.5 h-3.5" /> Copied!
                  </span>
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
              {!isUser && isLastAssistantMessage && onRetry && (
                <button
                  onClick={onRetry}
                  className="p-1 text-app-muted hover:text-app-fg hover:bg-app-bg rounded-lg transition-colors"
                  title="Regenerate response"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {message.quote && (
            <div className="mb-3 px-3 py-2 border-l-4 border-indigo-500 bg-indigo-500/10 rounded-r-lg font-serif italic text-[0.8rem] text-app-fg opacity-90 break-words whitespace-pre-wrap relative group/quote">
              <div className="absolute -top-2 -left-1 text-indigo-500 text-xl font-bold opacity-50">"</div>
              {message.quote}
            </div>
          )}

          {/* Content or Edit Form */}
          {isEditing ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full p-3 text-xs bg-app-card border border-app-primary rounded-xl text-app-fg font-sans focus:outline-none shadow-xs"
                rows={3}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1 text-xs text-app-text-secondary hover:bg-indigo-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1 text-xs bg-app-card text-indigo-700 dark:text-indigo-300 font-bold rounded-lg hover:bg-app-bg shadow-xs"
                >
                  Save &amp; Resend
                </button>
              </div>
            </div>
          ) : (
            <div className={`text-[15px] leading-[1.7] overflow-hidden ${isUser ? "text-app-user-fg" : "text-app-fg"}`}>
              {isUser ? (
                <div>
                  
                  {/* Attachments Array */}
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="mb-3 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {message.attachments.map((file, idx) => (
                          <div key={idx} className="relative group inline-block max-w-[200px] rounded-xl overflow-hidden border border-white/20 shadow-xs bg-black/10">
                            {file.type === "image" ? (
                              <img src={file.dataUrl} alt={file.fileName} className="w-full h-auto object-cover rounded-xl" />
                            ) : file.type === "zip" ? (
                                <div className="inline-flex items-center gap-2 px-3 py-2 text-xs font-mono">
                                  <FileArchive className="w-4 h-4 text-emerald-300" />
                                  <span className="truncate">{file.fileName}</span>
                                </div>
                            ) : (
                                <div className="inline-flex items-center gap-2 px-3 py-2 text-xs font-mono">
                                  <FileArchive className="w-4 h-4 text-indigo-300" />
                                  <span className="truncate">{file.fileName}</span>
                                </div>
                            )}
                          </div>
                        ))}
                      </div>
                      
                      <button
                          type="button"
                          onClick={() => setShowImageDetails(!showImageDetails)}
                          className="text-[11px] font-mono flex items-center gap-1.5 opacity-85 hover:opacity-100 transition-opacity underline decoration-dotted underline-offset-2 cursor-pointer mt-2"
                      >
                          {showImageDetails ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          <span>{showImageDetails ? "Hide Files Content/Vision" : "View Files Content/Vision"}</span>
                      </button>
                      
                      {showImageDetails && (
                          <div className="mt-2 p-3 bg-indigo-900/40 rounded-xl text-xs font-mono whitespace-pre-wrap border border-indigo-400/30 max-h-52 overflow-y-auto leading-relaxed text-indigo-100 shadow-inner">
                            <div className="text-[10px] font-bold uppercase tracking-wider mb-1 text-app-text-secondary flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-indigo-300" />
                              Files Transcoded Text:
                            </div>
                            {message.attachments.map((file, idx) => (
                              <div key={idx} className="mb-2">
                                <span className="font-bold">[{file.type.toUpperCase()}: {file.fileName}]</span>
                                {file.type === "image" ? " (Processed by Vision endpoint)" : " (Context Length: " + (file.content?.length || 0) + ")"}
                              </div>
                            ))}
                          </div>
                      )}
                    </div>
                  )}

                  {/* Legacy Image Support */}
                  {message.image && (
                    <div className="mb-3 space-y-2">
                      <div className="relative group inline-block max-w-sm rounded-xl overflow-hidden border border-white/20 shadow-xs bg-black/10">
                        <img
                          src={message.image}
                          alt="User uploaded attachment"
                          className="max-h-60 w-auto object-contain rounded-xl"
                        />
                      </div>
                      {message.imageDescription && (
                        <div>
                          <button
                            type="button"
                            onClick={() => setShowImageDetails(!showImageDetails)}
                            className="text-[11px] font-mono flex items-center gap-1.5 opacity-85 hover:opacity-100 transition-opacity underline decoration-dotted underline-offset-2 cursor-pointer"
                          >
                            {showImageDetails ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            <span>{showImageDetails ? "Hide Vision Transcoded Text" : "View Vision Transcoded Text"}</span>
                          </button>
                          {showImageDetails && (
                            <div className="mt-2 p-3 bg-indigo-900/40 rounded-xl text-xs font-mono whitespace-pre-wrap border border-indigo-400/30 max-h-52 overflow-y-auto leading-relaxed text-indigo-100 shadow-inner">
                              <div className="text-[10px] font-bold uppercase tracking-wider mb-1 text-app-text-secondary flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-indigo-300" />
                                Auto Transcoded Vision Text sent to model:
                              </div>
                              {message.imageDescription}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Legacy Zip Support */}
                  {message.zipFileName && (
                    <div className="mb-3 space-y-2">
                      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-black/10 border border-white/20 text-xs font-mono shadow-xs">
                        <FileArchive className="w-4 h-4 text-emerald-300" />
                        <span>{message.zipFileName}</span>
                      </div>
                      {message.attachedZipContent && (
                        <div>
                          <button
                            type="button"
                            onClick={() => setShowImageDetails(!showImageDetails)}
                            className="text-[11px] font-mono flex items-center gap-1.5 opacity-85 hover:opacity-100 transition-opacity underline decoration-dotted underline-offset-2 cursor-pointer"
                          >
                            {showImageDetails ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            <span>{showImageDetails ? "Hide Zip Context" : "View Zip Context"}</span>
                          </button>
                          {showImageDetails && (
                            <div className="mt-2 p-3 bg-indigo-900/40 rounded-xl text-[10px] font-mono whitespace-pre-wrap border border-indigo-400/30 max-h-52 overflow-y-auto leading-relaxed text-indigo-100 shadow-inner break-all">
                              <div className="font-bold uppercase tracking-wider mb-1 text-app-text-secondary flex items-center gap-1">
                                <Layers className="w-3 h-3 text-indigo-300" />
                                Extracted Zip Contents injected into context:
                              </div>
                              {message.attachedZipContent}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {message.content && <p className="whitespace-pre-wrap">{message.content}</p>}

                </div>
              ) : (
                <div className="markdown-body text-app-fg break-words break-all">
                  <Markdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ node, inline, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || "");
                        const codeText = String(children).replace(/\n$/, "");
                        const isSingleLine = !codeText.includes("\n") && codeText.length < 120;
                        if (!inline && !isSingleLine) {
                          const language = match ? match[1] : "text";
                          return (
                            <div className="relative my-4 rounded-xl overflow-hidden border border-[#30363D] bg-[#1E1E1E] shadow-lg">
                              <div className="flex items-center justify-between px-4 py-2 bg-[#1E1E1E] border-b border-[#30363D]">
                                <span className="text-xs font-mono font-semibold text-gray-200 capitalize flex items-center gap-2">
                                  <span className="text-app-primary hover:text-app-primary-hover">&lt;/&gt;</span>
                                  {language}
                                </span>
                                <CodeCopyButton codeText={codeText} />
                              </div>
                              <div className="text-[13px] leading-relaxed max-w-full overflow-x-auto">
                                {isStreaming ? (
                                  <div className="m-0 p-4 bg-transparent text-[13px] text-[#D4D4D4] font-mono whitespace-pre">
                                    {codeText}
                                  </div>
                                ) : (
                                  <SyntaxHighlighter
                                    style={vscDarkPlus as any}
                                    language={language}
                                    PreTag="div"
                                    customStyle={{ margin: 0, padding: "16px", background: "transparent", fontSize: "13px" }}
                                  >
                                    {codeText}
                                  </SyntaxHighlighter>
                                )}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <code className={`${className || ""} bg-[#2d2d2d] text-[#e0e0e0] px-1.5 py-0.5 rounded text-[0.85em] font-mono whitespace-pre-wrap`} {...props}>
                            {children}
                          </code>
                        );
                      },
                      p({ children }) {
                        return <p className="mb-2.5 last:mb-0 leading-relaxed">{children}</p>;
                      },
                      ul({ children }) {
                        return <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>;
                      },
                      ol({ children }) {
                        return <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>;
                      },
                      li({ children }) {
                        return <li className="mb-0.5">{children}</li>;
                      },
                      a({ href, children }) {
                        return (
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="text-app-primary hover:text-app-primary-hover hover:underline font-medium"
                          >
                            {children}
                          </a>
                        );
                      },
                      blockquote({ children }) {
                        return (
                          <blockquote className="border-l-3 border-app-primary pl-3 italic text-app-muted my-2.5">
                            {children}
                          </blockquote>
                        );
                      },
                      table({ children }) {
                        return (
                          <div className="overflow-x-auto my-3 border border-app-border rounded-xl bg-app-card shadow-xs">
                            <table className="w-full text-xs text-left text-app-fg border-collapse">
                              {children}
                            </table>
                          </div>
                        );
                      },
                      thead({ children }) {
                        return <thead className="bg-app-surface text-app-text-primary font-semibold">{children}</thead>;
                      },
                      th({ children }) {
                        return <th className="px-3.5 py-2.5 text-app-text-primary font-semibold text-xs tracking-wide">{children}</th>;
                      },
                      tbody({ children }) {
                        return <tbody className="divide-y divide-slate-200 text-app-fg">{children}</tbody>;
                      },
                      td({ children }) {
                        return <td className="px-3.5 py-2.5 border-t border-app-border">{children}</td>;
                      },
                    }}
                  >
                    {message.content}
                  </Markdown>

                  {isLastAssistantMessage && isStreaming && (
                    <div className="flex items-center gap-2 p-3 text-xs text-app-primary font-mono bg-app-surface-active rounded-2xl border border-app-border max-w-xs animate-pulse shadow-xs mt-4">
                      <Sparkles className="w-4 h-4 animate-spin text-app-primary" />
                      <span>Streaming response with zero lag...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.message.content === nextProps.message.content &&
      prevProps.message.isError === nextProps.message.isError &&
      prevProps.isStreaming === nextProps.isStreaming &&
      prevProps.isLastAssistantMessage === nextProps.isLastAssistantMessage
    );
  }
);
