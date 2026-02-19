import { useState } from "react";
import { useContactStore } from "../../stores/contactStore";
import { PIN_REGEX, PIN_PREFIX } from "../../utils/constants";
import { Loader2 } from "lucide-react";

export function AddContact({ onAdded }: { onAdded?: () => void }) {
  const [pin, setPin] = useState("");
  const { addContact, loading, error, clearError } = useContactStore();

  const handleSimpleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPin(e.target.value.toUpperCase());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    let formattedPin = pin.trim().toUpperCase();

    // Auto-fix if they forgot ARL-
    if (!formattedPin.startsWith(PIN_PREFIX) && /^[A-Z0-9]{6}$/.test(formattedPin)) {
      formattedPin = `${PIN_PREFIX}${formattedPin}`;
    }

    if (!PIN_REGEX.test(formattedPin)) {
      return;
    }

    try {
      await addContact(formattedPin);
      setPin("");
      onAdded?.();
    } catch {
      // Error is set in store
    }
  };

  const isValidFormat = (p: string) => {
    const normalized = p.trim().toUpperCase();
    // Allow raw 6 chars OR full format
    return /^[A-Z0-9]{6}$/.test(normalized) || PIN_REGEX.test(normalized);
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 flex flex-col animate-fade-in text-left">
      <div className="flex gap-3">
        <input
          type="text"
          value={pin}
          onChange={handleSimpleChange}
          placeholder="ARL-XXXXXX"
          maxLength={12}
          className={`
            flex-1 h-9 rounded-lg bg-[#111] border text-[13px] font-mono text-white px-3 placeholder:text-[#444]
            outline-none transition-all duration-150 ease-out
            ${error ? "border-danger" : "border-[#222] focus:border-[#444]"}
          `}
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !isValidFormat(pin)}
          className={`
            h-9 px-4 rounded-lg text-[12px] font-medium transition-all duration-150 flex items-center justify-center min-w-[60px]
            ${loading || !isValidFormat(pin)
              ? "bg-[#1A1A1A] text-[#444] cursor-not-allowed"
              : "bg-white text-black hover:bg-[#E5E5E5] active:scale-95"}
          `}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : "Add"}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-[11px] text-danger font-medium px-1 animate-fade-in">
          {error}
        </p>
      )}

      <p className="mt-2 text-[11px] text-text-muted px-1">
        Prefix <span className="text-text-secondary font-mono">ARL-</span> is optional.
      </p>
    </form>
  );
}
