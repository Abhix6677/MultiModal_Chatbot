import React, { useState, useRef, useEffect } from "react";
import {
  Square,
  Paperclip,
  Cpu,
  Layers,
  X,
  Image as ImageIcon,
  Eye,
  Archive,
  FileText,
  Globe,
  ArrowUp,
  Brain,
} from "lucide-react";
import JSZip from "jszip";
import { AttachedFile } from "../types";

interface ChatInputProps {
  onSendMessage: (
    text: string,
    files: AttachedFile[],
    mode?: "chat" | "code" | "reasoning",
    webSearch?: boolean
  ) => void;
  isStreaming: boolean;
  onStopStreaming: () => void;
  onOpenConfig: () => void;
  hasMessages: boolean;
  modelName: string;
  quotedText?: string | null;
  onClearQuote?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  isStreaming,
  onStopStreaming,
  onOpenConfig,
  hasMessages,
  modelName,
  quotedText,
  onClearQuote,
}) => {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"chat" | "code" | "reasoning">("chat");
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      if (input) {
        textareaRef.current.style.height = `${Math.min(
          textareaRef.current.scrollHeight,
          200
        )}px`;
      }
    }
  }, [input]);

  const processFile = async (file: File) => {
    const fileId = "file_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setAttachedFiles(prev => [...prev, {
            id: fileId,
            type: "image",
            dataUrl: e.target!.result as string,
            mimeType: file.type || "image/jpeg",
            fileName: file.name || "Pasted Image",
          }]);
        }
      };
      reader.readAsDataURL(file);
    } else if (file.name.endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed") {
      try {
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(file);
        
        let combinedText = "";
        const ignoredDirs = ['node_modules', '.git', 'dist', 'build', '.vscode', '.idea', 'coverage', '.next'];
        const ignoredExts = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.mp4', '.mp3', '.wav', '.pdf', '.zip', '.tar', '.gz', '.woff', '.woff2', '.ttf', '.eot', '.wasm', '.lock', '.exe', '.dll', '.bin'];
        
        for (const relativePath of Object.keys(loadedZip.files)) {
          const zipEntry = loadedZip.files[relativePath];
          if (zipEntry.dir) continue;
          
          if (ignoredDirs.some(dir => relativePath.includes(`/${dir}/`) || relativePath.startsWith(`${dir}/`))) continue;
          
          const extMatch = relativePath.match(/\.[0-9a-z]+$/i);
          if (extMatch && ignoredExts.includes(extMatch[0].toLowerCase())) continue;
          
          try {
            const content = await zipEntry.async("string");
            if (content.indexOf('\0') !== -1) continue;
            
            combinedText += `\n\n--- File: ${relativePath} ---\n\`\`\`\n${content}\n\`\`\``;
          } catch(err) {
            console.warn("Could not read file:", relativePath);
          }
        }
        
        if (!combinedText.trim()) {
           alert("No readable text or code files found in the zip.");
           return;
        }
        
        if (combinedText.length > 500000) {
           combinedText = combinedText.substring(0, 500000) + "\n\n...[TRUNCATED DUE TO SIZE LIMIT]...";
        }

        setAttachedFiles(prev => [...prev, {
          id: fileId,
          type: "zip",
          content: combinedText,
          fileName: file.name,
        }]);
      } catch (err) {
        console.error("Error extracting zip:", err);
        alert("Failed to extract zip file. It might be corrupted or encrypted.");
      }
    } else {
      // Handle generic text files (code, json, txt, etc.)
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          const textContent = e.target.result as string;
          // Simple check for binary null bytes
          if (textContent.indexOf('\0') !== -1) {
            alert(`File "${file.name}" appears to be binary or unsupported.`);
            return;
          }
          setAttachedFiles(prev => [...prev, {
            id: fileId,
            type: "text",
            content: textContent,
            fileName: file.name,
          }]);
        }
      };
      reader.onerror = () => {
        alert("Could not read the file as text.");
      };
      reader.readAsText(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(file => processFile(file));
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1 || items[i].type.indexOf("text") !== -1 || items[i].kind === "file") {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          processFile(file);
        }
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if ((!input.trim() && attachedFiles.length === 0) || isStreaming) return;
    onSendMessage(
      input.trim(), 
      attachedFiles, 
      mode,
      isWebSearchEnabled
    );
    setInput("");
    setAttachedFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const removeFile = (id: string) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== id));
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-0">
      <input
        type="file"
        ref={fileInputRef}
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
      <div className="relative flex w-full flex-col gap-4">
        {quotedText && (
          <div className="mb-2.5 p-2 bg-accent border rounded-xl flex items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-1 h-8 bg-primary rounded-full shrink-0"></div>
              <div className="min-w-0">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                  Replying to
                </div>
                <div className="text-xs text-foreground truncate max-w-[200px] sm:max-w-md italic">
                  "{quotedText}"
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClearQuote}
              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0"
              title="Remove Quote"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="relative rounded-2xl border bg-card shadow-sm transition-shadow duration-300 focus-within:shadow-md focus-within:ring-1 focus-within:ring-ring/50">
          {attachedFiles.length > 0 && (
            <div className="flex w-full self-start flex-row gap-2 overflow-x-auto px-4 pt-4 no-scrollbar">
              {attachedFiles.map((file) => (
                <div key={file.id} className="relative group shrink-0 w-16 h-16 rounded-xl border bg-accent/50 flex items-center justify-center overflow-hidden">
                  {file.type === "image" ? (
                    <img
                      src={file.dataUrl}
                      alt="Attachment Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : file.type === "zip" ? (
                    <Archive className="w-6 h-6 text-muted-foreground" />
                  ) : (
                    <FileText className="w-6 h-6 text-muted-foreground" />
                  )}
                  <button
                    type="button"
                    onClick={() => removeFile(file.id)}
                    className="absolute -top-1 -right-1 p-1 bg-background/80 hover:bg-destructive hover:text-destructive-foreground rounded-full text-foreground opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm shadow-sm"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              attachedFiles.length > 0
                ? `Ask a question about the ${attachedFiles.length} attached file(s)...`
                : "Ask anything..."
            }
            rows={1}
            className="w-full min-h-[64px] max-h-48 resize-none bg-transparent px-4 pt-4 pb-2 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 border-none"
          />

          <div className="flex items-center justify-between px-3 pb-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`p-1.5 rounded-lg border transition-colors shrink-0 flex items-center gap-1 ${
                  attachedFiles.length > 0
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground"
                }`}
                title="Attach Files"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsWebSearchEnabled(!isWebSearchEnabled)}
                className={`p-1.5 rounded-lg border transition-colors shrink-0 flex items-center gap-1 ${
                  isWebSearchEnabled
                    ? "border-blue-500 text-blue-500"
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground"
                }`}
                title={isWebSearchEnabled ? "Web Search Enabled" : "Enable Web Search"}
              >
                <Globe className="w-4 h-4" />
              </button>

              <div className="hidden sm:flex ml-1 items-center gap-0.5 bg-accent/50 p-0.5 rounded-lg border">
                <button
                  type="button"
                  onClick={() => setMode("chat")}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    mode === "chat" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  General
                </button>
                <button
                  type="button"
                  onClick={() => setMode("code")}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    mode === "code" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Code
                </button>
                <button
                  type="button"
                  onClick={() => setMode("reasoning")}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    mode === "reasoning" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Reason
                </button>
              </div>

              <button
                type="button"
                onClick={onOpenConfig}
                className="ml-1 px-2.5 py-1.5 bg-accent/30 hover:bg-accent border text-muted-foreground hover:text-foreground rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-colors shrink-0"
              >
                <Cpu className="w-3.5 h-3.5" />
                <span className="truncate max-w-[120px]">{modelName || "custom-model"}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {isStreaming ? (
                <button
                  type="button"
                  onClick={onStopStreaming}
                  className="h-8 w-8 flex items-center justify-center bg-foreground text-background hover:opacity-85 active:scale-95 rounded-xl transition-all"
                  title="Stop generating"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!input.trim() && attachedFiles.length === 0}
                  className="h-8 w-8 flex items-center justify-center bg-foreground text-background disabled:bg-muted disabled:text-muted-foreground/30 hover:opacity-85 active:scale-95 disabled:hover:opacity-100 disabled:active:scale-100 cursor-pointer disabled:cursor-not-allowed rounded-xl transition-all"
                  title="Send message"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
