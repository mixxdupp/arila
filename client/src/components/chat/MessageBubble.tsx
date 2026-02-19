import type { Message } from "../../types";
import { MessageStatus } from "./MessageStatus";
import { formatTime } from "../../utils/helpers";

interface MessageBubbleProps {
  message: Message;
  isFirst: boolean;
  isLast: boolean;
  showStatus: boolean;
}

export function MessageBubble({ message, isFirst, isLast, showStatus }: MessageBubbleProps) {
  const isSent = message.senderId === "self";

  // Border Radius Logic
  const getBorderRadius = () => {
    if (isSent) {
      // SENT (Right)
      if (isFirst && isLast) return "rounded-[18px_18px_4px_18px]"; // Single
      if (isFirst) return "rounded-[18px_18px_4px_18px]"; // First in group
      if (isLast) return "rounded-[18px_4px_18px_18px]"; // Last in group
      return "rounded-[18px_4px_4px_18px]"; // Middle
    } else {
      // RECEIVED (Left)
      if (isFirst && isLast) return "rounded-[18px_18px_18px_4px]"; // Single
      if (isFirst) return "rounded-[18px_18px_18px_4px]"; // First in group
      if (isLast) return "rounded-[4px_18px_18px_18px]"; // Last in group
      return "rounded-[4px_18px_18px_4px]"; // Middle
    }
  };

  return (
    <div className={`flex flex-col ${isSent ? "items-end" : "items-start"} mb-0.5`}>
      <div
        className={`
          max-w-[70%] px-[14px] py-[10px] relative text-[15px] font-normal leading-relaxed text-white
          ${isSent ? "bg-[#1A1A1A]" : "bg-[#0A0A0A] border border-[#1A1A1A]"}
          ${getBorderRadius()}
        `}
      >
        <p className="whitespace-pre-wrap break-words">{message.plaintext}</p>
      </div>

      {showStatus && (
        <div className={`flex items-center gap-1 mt-1 mb-2 ${isSent ? "justify-end" : "justify-start"} px-1`}>
          <span className="text-[11px] font-light text-text-muted">
            {formatTime(message.timestamp)}
          </span>
          {isSent && <MessageStatus status={message.status} />}
          {message.disappearAfter && (
            <span className="text-[10px] text-text-muted" title="Disappearing message">
              &#9201;
            </span>
          )}
        </div>
      )}
    </div>
  );
}
