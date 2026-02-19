import { useState, useRef } from "react";
import { sendWsMessage } from "../../services/ws";
import { ArrowUp } from "lucide-react";

interface MessageInputProps {
  onSend: (text: string) => void;
  recipientId: string;
  disabled?: boolean;
}

export function MessageInput({ onSend, recipientId, disabled }: MessageInputProps) {
  const [text, setText] = useState("");
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);

    // Send typing indicator
    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
    }
    sendWsMessage({ type: "typing", recipientId });
    typingTimeout.current = setTimeout(() => {
      typingTimeout.current = null;
    }, 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    // Keep focus
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const hasText = text.trim().length > 0;

  return (
    <div className="bg-black px-4 pb-6 pt-2 sticky bottom-0 z-20">
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 bg-[#0A0A0A] rounded-full px-1.5 py-1.5 border border-[#1A1A1A] focus-within:border-[#333333] transition-colors duration-200"
      >
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="iMessage"
          disabled={disabled}
          className="flex-1 bg-transparent px-4 py-2 text-[15px] text-white placeholder:text-text-muted outline-none min-w-0"
        />

        {hasText && (
          <button
            type="submit"
            disabled={disabled}
            className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-black shrink-0 hover:scale-105 active:scale-95 transition-all duration-200 animate-scale-in"
          >
            <ArrowUp size={18} strokeWidth={2.5} />
          </button>
        )}
      </form>
    </div>
  );
}
