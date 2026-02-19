import { useContactStore } from "../../stores/contactStore";
import { useChatStore } from "../../stores/chatStore";
import { usePresence } from "../../hooks/usePresence";
import { StatusIndicator } from "../common/StatusIndicator";
import { formatTime } from "../../utils/helpers";

export function ContactList() {
  const contacts = useContactStore((s) => s.contacts);
  const conversations = useChatStore((s) => s.conversations);
  const setActiveContact = useChatStore((s) => s.setActiveContact);
  const activeContactId = useChatStore((s) => s.activeContactId);
  const { isOnline } = usePresence();

  // Sort contacts by last message time (most recent first)
  const sorted = [...contacts].sort((a, b) => {
    const convA = conversations[a.userId];
    const convB = conversations[b.userId];
    const lastA = convA?.messages[convA.messages.length - 1]?.timestamp ?? a.addedAt;
    const lastB = convB?.messages[convB.messages.length - 1]?.timestamp ?? b.addedAt;
    return new Date(lastB).getTime() - new Date(lastA).getTime();
  });

  if (sorted.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-[13px] font-light text-text-muted text-center tracking-wide">
          Share your PIN to start a conversation.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {sorted.map((contact) => {
        const conv = conversations[contact.userId];
        const lastMsg = conv?.messages[conv.messages.length - 1];
        const unreadCount = conv?.unreadCount ?? 0;
        const isActive = activeContactId === contact.userId;

        return (
          <button
            key={contact.userId}
            onClick={() => setActiveContact(contact.userId)}
            className={`
              w-full h-[72px] flex items-center relative transition-colors duration-100 px-4 group
              ${isActive ? "bg-[#0A0A0A]" : "hover:bg-[#0A0A0A]"}
            `}
          >
            {/* Status Dot */}
            <div className="mr-3 shrink-0">
              <StatusIndicator online={isOnline(contact.userId)} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pr-2">
              <div className="flex items-baseline justify-between mb-0.5">
                <span className="text-[14px] font-medium text-white truncate">
                  {contact.pin}
                </span>
                {lastMsg && (
                  <span className="text-[11px] font-light text-text-muted shrink-0 ml-2">
                    {formatTime(lastMsg.timestamp)}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between">
                <p className="text-[13px] font-light text-text-muted truncate leading-tight">
                  {lastMsg ? (
                    <>
                      {lastMsg.senderId === "self" && <span className="text-text-secondary">You: </span>}
                      {lastMsg.plaintext}
                    </>
                  ) : (
                    <span className="opacity-50">No messages</span>
                  )}
                </p>

                {unreadCount > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white text-[11px] font-bold text-black shrink-0 px-1 ml-2 animate-scale-in">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
            </div>

            {/* Divider (Inset 52px: 16px pad + 8px dot + 12px gap + variable) - Adjusted to visual preference approx 48px or 52px */}
            {/* The spec says inset 52px from left. 16px padding + 8px dot + 12px margin = 36px. Wait, 16+8+12 = 36. 
                Let's stick to the CSS class for absolute positioning or just a bottom border on a container div that has the margin. */}
            <div className="absolute bottom-0 right-0 left-[52px] h-px bg-[#0A0A0A] group-hover:hidden" />
          </button>
        );
      })}
    </div>
  );
}
