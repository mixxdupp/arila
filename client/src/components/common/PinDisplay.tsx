import { useState } from "react";
import { copyToClipboard } from "../../utils/helpers";

export function PinDisplay({ pin }: { pin: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(pin);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 rounded bg-bg-secondary px-3 py-1.5 font-mono text-xs tracking-wider text-text-secondary hover:text-text-primary transition-colors"
      title="Click to copy PIN"
    >
      <span>{pin}</span>
      <span className="text-text-muted">{copied ? "copied" : "copy"}</span>
    </button>
  );
}
