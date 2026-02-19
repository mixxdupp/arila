import { useEffect, useRef } from "react";
import { useChatStore } from "../../stores/chatStore";
import { useContactStore } from "../../stores/contactStore";
import { usePresence } from "../../hooks/usePresence";
import { useMessages } from "../../hooks/useMessages";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { DisappearingToggle } from "./DisappearingToggle";
import { StatusIndicator } from "../common/StatusIndicator";
import { formatDateSeparator, isSameDay } from "../../utils/helpers";
import { ChevronLeft } from "lucide-react";

export function ChatWindow() {
  const activeContactId = useChatStore((s) => s.activeContactId);
  const setActiveContact = useChatStore((s) => s.setActiveContact);
  const conversation = useChatStore((s) =>
    activeContactId ? s.conversations[activeContactId] ?? null : null
  );
  const isTyping = useChatStore((s) =>
    activeContactId ? activeContactId in s.typingUsers : false
  );
  const getContact = useContactStore((s) => s.getContact);
  const { isOnline } = usePresence();
  const { sendMessage, sendReadReceipt } = useMessages();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const contact = activeContactId ? getContact(activeContactId) : undefined;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages.length]);

  // Send read receipts for unread messages
  useEffect(() => {
    if (!activeContactId || !conversation) return;
    const unreadIncoming = conversation.messages.filter(
      (m) => m.senderId !== "self" && m.status !== "read"
    );
    for (const msg of unreadIncoming) {
      void sendReadReceipt(activeContactId, msg.id);
    }
  }, [activeContactId, conversation?.messages.length]);

  if (!activeContactId || !contact) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4">
          <span className="text-[13px] font-medium text-[#3A3A3C] tracking-wide">
            Select a conversation
          </span>
        </div>
      </div>
    );
  }

  const messages = conversation?.messages ?? [];

  const handleSend = (text: string) => {
    void sendMessage(activeContactId, text);
  };

  return (
    <div className="flex h-full flex-col bg-black">
      {/* Sticky Header with Glassmorphism */}
      <div className="h-[60px] px-5 flex items-center justify-between shrink-0 bg-black/80 backdrop-blur-xl border-b border-[rgba(255,255,255,0.06)] sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveContact(null)}
            className="text-white md:hidden hover:opacity-70 transition-opacity"
          >
            <ChevronLeft size={24} />
          </button>

          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-white tracking-wide">
                {contact.pin}
              </span>
              <StatusIndicator online={isOnline(activeContactId)} />
            </div>

            <p className="text-[11px] text-[#8E8E93] font-medium leading-none mt-0.5">
              {isTyping ? <span className="animate-pulse text-white">typing...</span> : (isOnline(activeContactId) ? "Online" : "Offline")}
            </p>
          </div>
        </div>

        <DisappearingToggle contactId={activeContactId} />
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-[13px] font-medium text-[#3A3A3C] mb-1">No messages yet</p>
              <p className="text-[11px] text-[#3A3A3C]">Say hello to start the conversation.</p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const prevMsg = messages[i - 1];
          const nextMsg = messages[i + 1];
          const showDate = !prevMsg || !isSameDay(prevMsg.timestamp, msg.timestamp);

          // Grouping logic (1 min threshold)
          const isSameSenderPrev = prevMsg && prevMsg.senderId === msg.senderId && !showDate && (new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime() < 60000);
          const isSameSenderNext = nextMsg && nextMsg.senderId === msg.senderId && (new Date(nextMsg.timestamp).getTime() - new Date(msg.timestamp).getTime() < 60000);

          const isFirst = !isSameSenderPrev;
          const isLast = !isSameSenderNext;
          const showStatus = isLast; // Only show status/timestamp on the last message of a group

          return (
            <div key={msg.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-backwards">
              {showDate && (
                <div className="flex justify-center my-6 sticky top-[68px] z-10 pointer-events-none">
                  <span className="text-[11px] font-medium text-[#8E8E93] bg-[#1C1C1E]/90 backdrop-blur-sm px-2 py-0.5 rounded-full shadow-sm">
                    {formatDateSeparator(msg.timestamp)}
                  </span>
                </div>
              )}
              <MessageBubble
                message={msg}
                isFirst={isFirst}
                isLast={isLast}
                showStatus={showStatus}
              />
            </div>
          );
        })}
        <div ref={messagesEndRef} className="h-2" />
      </div>

      {/* Input Area */}
      <MessageInput onSend={handleSend} recipientId={activeContactId} />
    </div>
  );
}
