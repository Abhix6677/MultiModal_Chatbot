import React, { useState, useEffect } from "react";
import { getAuthHeaders } from '../utils/conversationStorage';
import { Sparkles } from "lucide-react";

export interface GlobalSelectionPopoverProps {
  onQuote: (text: string, messageId?: string) => void;
  scrollContainerId?: string;
}

export const GlobalSelectionPopover: React.FC<GlobalSelectionPopoverProps> = ({ onQuote, scrollContainerId }) => {
  const [selectionState, setSelectionState] = useState<{ text: string; x: number; y: number, messageId?: string } | null>(null);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const handleMouseUp = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const selection = window.getSelection();
        const text = selection?.toString().trim();
        if (text && text.length > 0) {
          const range = selection?.getRangeAt(0);
          const rect = range?.getBoundingClientRect();
          
          let messageId: string | undefined = undefined;
          if (selection?.anchorNode) {
            const anchorElement = selection.anchorNode.nodeType === 3 
              ? selection.anchorNode.parentElement 
              : (selection.anchorNode as HTMLElement);
            const messageElement = anchorElement?.closest('[data-message-id]');
            if (messageElement) {
              messageId = messageElement.getAttribute('data-message-id') || undefined;
            }
          }

          if (rect) {
            let x = rect.left + rect.width / 2;
            let y = rect.top - 40;

            if (scrollContainerId) {
              const container = document.getElementById(scrollContainerId);
              if (container) {
                const containerRect = container.getBoundingClientRect();
                // Map the viewport coordinates to container-relative absolute coordinates
                x = rect.left - containerRect.left + container.scrollLeft + rect.width / 2;
                y = rect.top - containerRect.top + container.scrollTop - 40;
              }
            }

            setSelectionState({ text, x, y, messageId });
          }
        } else {
          setSelectionState(null);
        }
      }, 50);
    };

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.toString().trim().length === 0) {
        setSelectionState(null);
      }
    };

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("selectionchange", handleSelectionChange);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [scrollContainerId]);

  if (!selectionState) return null;

  return (
    <div
      className={`${scrollContainerId ? 'absolute' : 'fixed'} z-[9999] flex items-center shadow-2xl rounded-xl overflow-hidden animate-in fade-in zoom-in duration-200`}
      style={{ left: selectionState.x, top: selectionState.y, transform: "translateX(-50%)" }}
      onMouseDown={(e) => {
        e.preventDefault(); // Prevent stealing focus
      }}
    >
      <button
        type="button"
        className="bg-primary text-primary-foreground text-xs font-medium px-4 py-2 hover:bg-primary/90 flex items-center gap-2 cursor-pointer shadow-xl transition-colors rounded-xl border border-border"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onQuote(selectionState.text, selectionState.messageId);
          setSelectionState(null);
          window.getSelection()?.removeAllRanges();
        }}
      >
        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
        Ask
      </button>
    </div>
  );
};
