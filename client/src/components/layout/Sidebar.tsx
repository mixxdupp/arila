import { useState } from "react";
import { ContactList } from "../contacts/ContactList";
import { AddContact } from "../contacts/AddContact";
import { useAuth } from "../../hooks/useAuth";
import { Copy, Plus, Check, LogOut } from "lucide-react";
import { copyToClipboard } from "../../utils/helpers";

export function Sidebar() {
  const { pin, logout } = useAuth();
  const [showAddContact, setShowAddContact] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyPin = async () => {
    if (pin) {
      const success = await copyToClipboard(pin);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  return (
    <div className="flex h-full flex-col bg-black w-full md:w-[320px] relative border-r border-[#111]">
      {/* Header */}
      <div className="h-[60px] px-5 flex items-center justify-between shrink-0">
        <h1 className="text-[20px] font-bold tracking-[0.05em] text-white">
          ARILA.
        </h1>

        {/* User PIN / Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleCopyPin}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-[#111] transition-all group"
            title="Copy Your PIN"
          >
            <span className="font-mono text-[11px] text-[#444] group-hover:text-[#888] transition-colors tracking-wide">
              {pin}
            </span>
            {copied ? <Check size={12} className="text-white" /> : <Copy size={12} className="text-[#333] group-hover:text-white transition-colors" />}
          </button>
        </div>
      </div>

      {/* Action Bar */}
      <div className="h-10 px-5 flex items-center justify-between shrink-0 mb-2">
        <span className="text-[11px] font-semibold text-[#333] uppercase tracking-wider">
          Contacts
        </span>
        <button
          onClick={() => setShowAddContact(!showAddContact)}
          className={`
            w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 ease-out
            ${showAddContact
              ? "bg-white text-black rotate-45"
              : "bg-[#111] text-[#666] hover:bg-[#222] hover:text-white"}
          `}
          title="Add Contact"
        >
          <Plus size={16} strokeWidth={2} />
        </button>
      </div>

      {/* Add Contact Form (Inline) - Animated Wrapper */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showAddContact ? "max-h-24 opacity-100 mb-2" : "max-h-0 opacity-0"}`}>
        <div className="px-3">
          <AddContact onAdded={() => setShowAddContact(false)} />
        </div>
      </div>

      {/* Contact List */}
      <div className="flex-1 overflow-y-auto w-full">
        <ContactList />
      </div>

      {/* Footer / Logout */}
      <div className="p-4 mt-auto">
        <button
          onClick={() => void logout()}
          className="flex items-center gap-2 text-[12px] font-medium text-[#333] hover:text-white transition-colors px-2 py-1"
        >
          <LogOut size={14} />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
