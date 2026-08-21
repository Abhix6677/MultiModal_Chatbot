import React, { useState, useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ChatMessage } from "../types";
import {
  Copy,
  Check,
  RotateCcw,
  User,
  Bot,
  AlertTriangle,
  Pencil,
  Eye,
  EyeOff,
  FileArchive,
  Sparkles,
  Layers,
  Download,
} from "lucide-react";
const triggerFileDownload = (codeText: string, languageSpec: string) => {
  let ext = languageSpec.split(":")[0].toLowerCase() || "txt";
  let filename = languageSpec.includes(":") ? languageSpec.split(":")[1] : `snippet.${ext}`;

  let blobType = "text/plain";
  let blobContent = codeText;

  if (ext === "doc" || ext === "docx") {
    blobType = "application/msword";
    if (filename.endsWith(".docx")) {
      filename = filename.replace(/\.docx$/i, ".doc");
    } else if (!filename.endsWith(".doc")) {
      filename = `${filename}.doc`;
    }
    blobContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Document</title></head>
      <body>
        <div style="font-family: Calibri, sans-serif;">
          ${codeText.split("\\n").map(line => {
            if (line.startsWith("# ")) return `<h1>${line.replace("# ", "")}</h1>`;
            if (line.startsWith("## ")) return `<h2>${line.replace("## ", "")}</h2>`;
            if (line.startsWith("### ")) return `<h3>${line.replace("### ", "")}</h3>`;
            if (line.startsWith("- ")) return `<ul><li>${line.replace("- ", "")}</li></ul>`;
            return `<p>${line}</p>`;
          }).join("")}
        </div>
      </body>
      </html>
    `;
  } else if (ext === "csv") {
    blobType = "text/csv";
  } else if (ext === "html") {
    blobType = "text/html";
  }

  const blob = new Blob([blobContent], { type: blobType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const FileAttachmentCard = ({ codeText, languageSpec }: { codeText: string; languageSpec: string }) => {
  const [downloaded, setDownloaded] = useState(false);
  const ext = languageSpec.split(":")[0].toLowerCase() || "txt";
  const filename = languageSpec.includes(":") ? languageSpec.split(":")[1] : `snippet.${ext}`;

  const handleDownload = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    triggerFileDownload(codeText, languageSpec);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2500);
  };

  return (
    <div className="my-4 flex items-center justify-between p-4 rounded-xl border bg-card text-card-foreground shadow-sm max-w-sm">
      <div className="flex items-center gap-4 overflow-hidden">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary shrink-0">
          <FileArchive className="w-5 h-5" />
        </div>
        <div className="flex flex-col truncate">
          <span className="text-sm font-medium truncate" title={filename}>{filename}</span>
          <span className="text-xs text-muted-foreground uppercase">{ext} Document</span>
        </div>
      </div>
      <button
        onClick={handleDownload}
        className="ml-4 flex items-center gap-2 shrink-0 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        {downloaded ? (
          <>
            <Check className="w-3.5 h-3.5" />
            <span>Saved</span>
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </>
        )}
      </button>
    </div>
  );
};

const DownloadFileButton = ({ codeText, languageSpec }: { codeText: string; languageSpec: string }) => {
  const [downloaded, setDownloaded] = useState(false);

  const handleDownload = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    triggerFileDownload(codeText, languageSpec);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2500);
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="text-xs p-1.5 rounded-md transition-colors text-muted-foreground hover:bg-muted/50 hover:text-foreground flex items-center gap-1.5 font-mono cursor-pointer"
      title="Download as file"
    >
      {downloaded ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px] text-emerald-400 font-medium animate-in fade-in duration-200">Saved!</span>
        </>
      ) : (
        <>
          <Download className="w-3.5 h-3.5" />
          <span className="text-[11px] font-medium hidden sm:inline">Save</span>
        </>
      )}
    </button>
  );
};

const CodeCopyButton = ({ codeText }: { codeText: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-xs p-1.5 rounded-md transition-colors text-muted-foreground hover:bg-muted/50 hover:text-foreground flex items-center gap-1.5 font-mono cursor-pointer"
      title="Copy code block"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px] text-emerald-400 font-medium animate-in fade-in duration-200">Copied!</span>
        </>
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
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
    const [editText, setEditText] = useState(
      message.content.replace(/(?:\r?\n)*\[System: The user has selected .*? mode\..*?\]/g, "")
    );
    const [showImageDetails, setShowImageDetails] = useState(false);

    const markdownComponents = useMemo(
      () => ({
        code({ node, inline, className, children, ...props }: any) {
          const match = /language-([\w\-]+(:[\w\-\.]+)?)/.exec(className || "");
          const codeText = String(children).replace(/\n$/, "");
          const isSingleWord = !codeText.includes("\n") && !codeText.includes(" ");
          
          if (!inline && !isSingleWord) {
            const languageSpec = match ? match[1] : "text";
            const language = languageSpec.split(":")[0].toLowerCase();
            
            // Intercept file attachments and render premium card UI
            if (["doc", "docx", "pdf", "csv"].includes(language)) {
              return <FileAttachmentCard codeText={codeText} languageSpec={languageSpec} />;
            }

            return (
              <div className="my-5 rounded-xl overflow-hidden border bg-[#0d1117]">
                <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d]">
                  <span className="text-xs font-mono font-medium text-gray-400">
                    {languageSpec.includes(":") ? languageSpec.split(":")[1] : language}
                  </span>
                  <div className="flex items-center gap-1">
                    <DownloadFileButton codeText={codeText} languageSpec={languageSpec} />
                    <CodeCopyButton codeText={codeText} />
                  </div>
                </div>
                <div className="text-[13px] leading-relaxed max-w-full overflow-x-auto">
                  {isStreaming ? (
                    <div className="p-4 bg-transparent text-[#e6edf3] font-mono whitespace-pre">
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
            <code className="bg-muted px-1.5 py-0.5 rounded-md text-[0.85em] font-mono" {...props}>
              {children}
            </code>
          );
        },
        p({ children }: any) {
          return <p className="mb-4 last:mb-0 leading-[1.75]">{children}</p>;
        },
        ul({ children }: any) {
          return <ul className="list-disc pl-5 mb-4 space-y-1.5">{children}</ul>;
        },
        ol({ children }: any) {
          return <ol className="list-decimal pl-5 mb-4 space-y-1.5">{children}</ol>;
        },
        li({ children }: any) {
          return <li className="mb-1 pl-1">{children}</li>;
        },
        a({ href, children }: any) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-blue-500 dark:text-blue-400 font-medium underline underline-offset-4 decoration-blue-500/40 dark:decoration-blue-400/40 hover:decoration-blue-500 dark:hover:decoration-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
            >
              {children}
            </a>
          );
        },
        blockquote({ children }: any) {
          return (
            <blockquote className="border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground my-4">
              {children}
            </blockquote>
          );
        },
        table({ children }: any) {
          return (
            <div className="overflow-x-auto my-4 border rounded-xl">
              <table className="w-full text-sm text-left border-collapse">
                {children}
              </table>
            </div>
          );
        },
        thead({ children }: any) {
          return <thead className="bg-muted/50 font-semibold">{children}</thead>;
        },
        th({ children }: any) {
          return <th className="px-4 py-3 font-semibold text-xs tracking-wide uppercase border-b">{children}</th>;
        },
        tbody({ children }: any) {
          return <tbody className="divide-y">{children}</tbody>;
        },
        td({ children }: any) {
          return <td className="px-4 py-3">{children}</td>;
        },
      }),
      [isStreaming]
    );

    const handleCopy = () => {
      let cleanContent = message.content.replace(/(?:\r?\n)*\[System: The user has selected .*? mode\..*?\]/g, "");
      cleanContent = cleanContent.replace(/^\[(?:Strict Technical\/Code|Reasoning) Mode Response\](?:\r?\n)*/i, "");
      navigator.clipboard.writeText(cleanContent);
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
        <div className="flex justify-center my-4 font-mono w-full">
          <div className="px-4 py-2 rounded-2xl bg-muted/50 border text-muted-foreground text-xs flex items-center gap-2 max-w-lg shadow-sm">
            <Sparkles className="w-4 h-4 shrink-0 text-yellow-500" />
            <span>System: {message.content}</span>
          </div>
        </div>
      );
    }

    if (isUser) {
      return (
        <div className="group relative flex flex-col items-end w-full max-w-3xl mx-auto mb-6">
          <div className="max-w-[85%] bg-muted text-foreground px-5 py-3.5 rounded-3xl rounded-tr-sm shadow-sm relative">
            {isEditing ? (
              <div className="space-y-3 w-full min-w-[280px] sm:min-w-[400px]">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full p-3 text-[15px] bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-ring resize-none min-h-[100px]"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="px-3 py-1.5 text-sm bg-primary text-primary-foreground font-medium rounded-lg hover:opacity-90 transition-opacity"
                  >
                    Save & Resend
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* User Attachments */}
                {message.attachments && message.attachments.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {message.attachments.map((file, idx) => (
                      <div key={idx} className="relative group inline-block">
                        {file.type === "image" ? (
                          <div className="max-w-[280px] rounded-xl overflow-hidden border bg-background/50 shadow-sm">
                            <img src={file.dataUrl} alt={file.fileName} className="w-full h-auto object-cover" />
                          </div>
                        ) : (
                          <div className="flex h-12 max-w-[220px] rounded-2xl border border-border/40 bg-accent/40 items-center pr-4 pl-2 overflow-hidden shadow-sm">
                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent border border-border/50 flex items-center justify-center mr-3 overflow-hidden">
                              {file.type === "zip" ? (
                                <FileArchive className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                              )}
                            </div>
                            <div className="flex flex-col justify-center min-w-0 py-1">
                              <span className="text-[13px] font-medium text-foreground truncate leading-tight">
                                {file.fileName || "Unnamed file"}
                              </span>
                              <span className="text-[11px] font-medium text-muted-foreground/80 uppercase tracking-wider mt-0.5">
                                {file.type === "zip" ? "ZIP ARCHIVE" : "DOCUMENT"}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {message.content && !/^\[Attached \d+ File\(s\)\]$/.test(message.content.trim()) && (
                  <div className="text-[15px] leading-relaxed whitespace-pre-wrap">
                    {message.content.replace(/(?:\r?\n)*\[System: The user has selected .*? mode\..*?\]/g, "")}
                  </div>
                )}
              </>
            )}
            
            {/* Action Bar for User Message */}
            {!isEditing && (
              <div className="absolute -bottom-8 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-background/80 backdrop-blur-sm border rounded-lg p-1 shadow-sm">
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                  title="Edit message"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleCopy}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                  title="Copy message"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Assistant Message Layout (Vercel Style)
    return (
      <div className={`group relative flex gap-4 w-full max-w-3xl mx-auto mb-8 ${message.isError ? "bg-destructive/10 p-4 rounded-xl border border-destructive/20" : ""}`}>
        {/* Avatar */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${message.isError ? "bg-destructive text-destructive-foreground" : "border bg-background shadow-sm"}`}>
          {message.isError ? (
            <AlertTriangle className="w-4 h-4" />
          ) : (
            <Sparkles className={`w-4 h-4 ${isStreaming && isLastAssistantMessage ? "animate-spin text-primary" : ""}`} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="text-[15px] leading-relaxed text-foreground min-h-[32px] flex flex-col justify-center">
            {message.isError ? (
              <div className="text-destructive whitespace-pre-wrap">{message.content}</div>
            ) : (
              <div className="markdown-body">
                {!message.content.trim() && isStreaming && isLastAssistantMessage ? (
                  <div className="flex items-center gap-1.5 h-6">
                    <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-primary/80 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                ) : (
                  <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {message.content.replace(/^\[(?:Strict Technical\/Code|Reasoning) Mode Response\](?:\r?\n)*/i, "")}
                  </Markdown>
                )}
              </div>
            )}
            
            {/* Assistant Actions */}
            {!isStreaming && (
              <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={handleCopy}
                  className="p-1.5 text-muted-foreground hover:bg-accent rounded-md transition-colors flex items-center gap-1.5"
                  title="Copy response"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-[11px] font-mono text-emerald-500 font-medium animate-in fade-in duration-200">Copied!</span>
                    </>
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                {isLastAssistantMessage && onRetry && (
                  <button
                    onClick={onRetry}
                    className="p-1.5 text-muted-foreground hover:bg-accent rounded-md transition-colors"
                    title="Regenerate"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
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
