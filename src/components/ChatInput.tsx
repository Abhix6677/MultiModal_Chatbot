import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  Square,
  Paperclip,
  Sliders,
  Sparkles,
  ChevronDown,
  Brain,
  ArrowUp,
  Cpu,
  Layers,
  X,
  Image as ImageIcon,
  Eye,
  Archive,
  FileText,
  Globe,
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
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(true);
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
    <div className="w-full max-w-5xl mx-auto px-4 pb-4 pt-1">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
      <div className="bg-app-card border border-app-primary ring-1 ring-app-primary rounded-2xl p-3.5 shadow-lg transition-all duration-200">
        
        {/* Attached Files Preview */}
        {attachedFiles.length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-2 animate-fadeIn">
            {attachedFiles.map((file) => (
              <div key={file.id} className="p-2 bg-indigo-50/80 border border-indigo-200/80 rounded-xl flex items-center justify-between gap-3 min-w-[200px] max-w-xs">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  {file.type === "image" ? (
                    <img
                      src={file.dataUrl}
                      alt="Attachment Preview"
                      className="w-10 h-10 object-cover rounded-lg border border-indigo-200 shrink-0"
                    />
                  ) : file.type === "zip" ? (
                    <div className="w-10 h-10 bg-indigo-100/50 rounded-lg border border-indigo-200 shrink-0 flex items-center justify-center">
                      <Archive className="w-5 h-5 text-indigo-600" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 bg-indigo-100/50 rounded-lg border border-indigo-200 shrink-0 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-indigo-600" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-stone-900 truncate flex items-center gap-1.5">
                      {file.type === "image" && <ImageIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                      {file.type === "zip" && <Archive className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                      {file.type === "text" && <FileText className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                      <span className="truncate">{file.fileName}</span>
                    </div>
                    <div className="text-[10px] text-indigo-700 font-mono flex items-center gap-1 mt-0.5">
                      {file.type === "image" && (
                        <>
                          <Eye className="w-3 h-3 text-indigo-500 shrink-0" />
                          <span>Vision Transcoder</span>
                        </>
                      )}
                      {file.type === "zip" && (
                        <>
                          <Layers className="w-3 h-3 text-indigo-500 shrink-0" />
                          <span>Zip Workspace</span>
                        </>
                      )}
                      {file.type === "text" && (
                        <>
                          <FileText className="w-3 h-3 text-indigo-500 shrink-0" />
                          <span>Text Context</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(file.id)}
                  className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-lg transition-colors shrink-0"
                  title="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Quoted Text Pill */}
        {quotedText && (
          <div className="mb-2.5 p-2 bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/30 rounded-xl flex items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-1.5 h-8 bg-indigo-400 rounded-full shrink-0"></div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider mb-0.5">
                  Replying to
                </div>
                <div className="text-xs text-app-fg truncate max-w-[200px] sm:max-w-md italic">
                  "{quotedText}"
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClearQuote}
              className="p-1.5 text-app-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors shrink-0"
              title="Remove Quote"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            attachedFiles.length > 0
              ? `Ask a question about the ${attachedFiles.length} attached file(s)...`
              : "Ask anything or paste/attach files (images, zips, text)..."
          }
          rows={1}
          className="w-full no-focus-ring bg-transparent border-none outline-none shadow-none ring-0 focus:ring-0 focus:border-none focus:outline-none text-sm text-app-fg placeholder-app-input-placeholder resize-none min-h-[24px] max-h-48 font-sans leading-normal py-1"
        />

        {/* Action Controls Toolbar */}
        <div className="flex items-center justify-between pt-1 mt-1 select-none">
          {/* Left Side: Attachment, Model Selector, Mode Pills */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5">
            <button
              type="button"
              onClick={() => setIsWebSearchEnabled(!isWebSearchEnabled)}
              className={`p-1.5 rounded-lg transition-colors shrink-0 flex items-center gap-1 ${
                isWebSearchEnabled
                  ? "text-blue-500 bg-blue-500/10 font-medium"
                  : "text-stone-500 dark:text-[#B4BBC7] hover:text-stone-900 dark:hover:text-[#F1F3F7] hover:bg-app-surface-hover"
              }`}
              title={isWebSearchEnabled ? "Web Search Enabled (Will browse the internet)" : "Enable Web Search"}
            >
              <Globe className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`p-1.5 rounded-lg transition-colors shrink-0 flex items-center gap-1 ${
                attachedFiles.length > 0
                  ? "text-app-primary bg-app-primary/10 font-medium"
                  : "text-stone-500 dark:text-[#B4BBC7] hover:text-stone-900 dark:hover:text-[#F1F3F7] hover:bg-app-surface-hover"
              }`}
              title="Attach Files (Images, Zips, Docs)"
            >
              <Paperclip className="w-4 h-4" />
              {attachedFiles.length > 0 && <span className="text-[10px] font-mono">{attachedFiles.length} File(s)</span>}
            </button>

            {/* Model Badge */}
            <button
              type="button"
              onClick={onOpenConfig}
              className="px-2.5 py-1 bg-app-surface hover:bg-app-surface-hover text-stone-500 dark:text-[#B4BBC7] hover:text-stone-900 dark:hover:text-[#F1F3F7] rounded-xl text-xs font-mono flex items-center gap-1.5 transition-colors shrink-0 border border-app-border shadow-2xs"
            >
              <Cpu className="w-3.5 h-3.5 text-indigo-600" />
              <span className="truncate max-w-[150px] font-semibold">{modelName || "custom-model"}</span>
            </button>

            {/* Mode Pills */}
            <div className="hidden sm:flex items-center gap-1 bg-app-surface p-0.5 rounded-xl border border-app-border shrink-0 shadow-2xs">
              <button
                type="button"
                onClick={() => setMode("chat")}
                className={`px-2.5 py-0.5 rounded-lg text-[11px] font-mono transition-all ${
                  mode === "chat"
                    ? "bg-app-primary text-white font-semibold shadow-2xs"
                    : "text-stone-500 dark:text-[#B4BBC7] hover:text-stone-900 dark:hover:text-[#F1F3F7]"
                }`}
              >
                General
              </button>
              <button
                type="button"
                onClick={() => setMode("code")}
                className={`px-2.5 py-0.5 rounded-lg text-[11px] font-mono transition-all ${
                  mode === "code"
                    ? "bg-app-primary text-white font-semibold shadow-2xs"
                    : "text-stone-500 dark:text-[#B4BBC7] hover:text-stone-900 dark:hover:text-[#F1F3F7]"
                }`}
              >
                Code
              </button>
              <button
                type="button"
                onClick={() => setMode("reasoning")}
                className={`px-2.5 py-0.5 rounded-lg text-[11px] font-mono transition-all ${
                  mode === "reasoning"
                    ? "bg-app-primary text-white font-semibold shadow-2xs"
                    : "text-stone-500 dark:text-[#B4BBC7] hover:text-stone-900 dark:hover:text-[#F1F3F7]"
                }`}
              >
                Reasoning
              </button>
            </div>
          </div>

          {/* Right Side: Send/Stop Button */}
          <div className="flex items-center gap-2 shrink-0 pl-2">
            <span className="text-[10px] text-app-muted font-mono hidden md:inline hover:text-app-fg transition-colors cursor-default">
              Press Enter ↵
            </span>
            {isStreaming ? (
              <button
                type="button"
                onClick={onStopStreaming}
                className="p-2 bg-red-600 hover:bg-red-500 text-white rounded-xl transition-all shadow-md shadow-red-600/20"
                title="Stop generating"
              >
                <Square className="w-4 h-4 fill-white" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!input.trim() && attachedFiles.length === 0}
                className="p-2 bg-app-primary hover:bg-indigo-500 disabled:opacity-100 disabled:bg-stone-100 dark:disabled:bg-[#151923] disabled:text-stone-400 dark:disabled:text-[#707887] disabled:border disabled:border-stone-200 dark:disabled:border-[#252B35] disabled:shadow-none text-white rounded-xl transition-all shadow-md shadow-indigo-600/20 cursor-pointer disabled:cursor-not-allowed"
                title="Send Prompt"
              >
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
