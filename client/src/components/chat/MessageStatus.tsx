import type { MessageStatus as Status } from "../../types";
import { Check, CheckCheck, Clock, AlertCircle } from "lucide-react";

export function MessageStatus({ status }: { status: Status }) {
  switch (status) {
    case "sending":
      return <Clock size={12} className="text-text-muted" strokeWidth={2} />;
    case "sent":
      return <Check size={12} className="text-text-muted" strokeWidth={2} />;
    case "delivered":
      return <CheckCheck size={12} className="text-text-muted" strokeWidth={2} />;
    case "read":
      return <CheckCheck size={12} className="text-success" strokeWidth={2} />;
    case "failed":
      return <AlertCircle size={12} className="text-danger" strokeWidth={2} />;
    default:
      return null;
  }
}
