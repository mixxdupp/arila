import { useState, useRef, useEffect } from "react";
import { useChatStore } from "../../stores/chatStore";
import { DISAPPEAR_OPTIONS } from "../../utils/constants";
import type { DisappearTimer } from "../../types";
import { Timer, Check, ChevronDown } from "lucide-react";

export function DisappearingToggle({ contactId }: { contactId: string }) {
  const disappearTimer = useChatStore((s) => s.conversations[contactId]?.disappearTimer ?? null);
  const setDisappearTimer = useChatStore((s) => s.setDisappearTimer);
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleSelect = (val: string) => {
    setDisappearTimer(contactId, val === "null" ? null : (parseInt(val, 10) as DisappearTimer));
    setIsOpen(false);
  };

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const currentLabel = DISAPPEAR_OPTIONS.find(
    (opt) => String(opt.value) === String(disappearTimer)
  )?.label || "Off";

  const isOff = disappearTimer === null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-200 border
          ${isOff
            ? "bg-transparent border-transparent text-text-muted hover:bg-[#111] hover:text-white"
            : "bg-white border-white text-black hover:bg-[#E5E5E5]"}
        `}
        title="Disappearing messages"
      >
        <Timer size={14} strokeWidth={isOff ? 2 : 2.5} />
        <span className="text-[11px] font-medium tracking-wide">{currentLabel}</span>
        {isOff && <ChevronDown size={10} className="opacity-50" />}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-[#1A1A1A] border border-[#333] rounded-xl shadow-2xl py-1 z-30 animate-scale-in origin-top-right overflow-hidden">
          <div className="px-3 py-2 border-b border-[#2A2A2A] mb-1">
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
              Disappearing Messages
            </span>
          </div>
          {DISAPPEAR_OPTIONS.map((opt) => {
            const isSelected = String(opt.value) === String(disappearTimer);
            return (
              <button
                key={String(opt.value)}
                onClick={() => handleSelect(String(opt.value))}
                className={`
                  w-full text-left px-3 py-2 text-[13px] flex items-center justify-between transition-colors
                  ${isSelected ? "text-white bg-[#333]" : "text-text-secondary hover:bg-[#2A2A2A] hover:text-white"}
                `}
              >
                <span>{opt.label}</span>
                {isSelected && <Check size={14} className="text-white" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
