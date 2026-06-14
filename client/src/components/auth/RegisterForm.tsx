import { useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import { copyToClipboard } from "../../utils/helpers";
import { AuthLayout } from "./AuthLayout";
import { Copy, ArrowRight, Check } from "lucide-react";

export function RegisterForm({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registeredPin, setRegisteredPin] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState<"username" | "password" | "confirm" | null>(null);

  const { register, loading, error, clearError } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    clearError();

    if (username.length < 3) {
      setValidationError("Username must be at least 3 characters");
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setValidationError("Username can only contain letters, numbers, and underscores");
      return;
    }

    if (password.length < 8) {
      setValidationError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setValidationError("Passwords do not match");
      return;
    }

    try {
      const pin = await register(username, password);
      setRegisteredPin(pin);
    } catch {
      // Error is set in the store
    }
  };

  const handleCopyPin = async () => {
    if (registeredPin) {
      const success = await copyToClipboard(registeredPin);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  if (registeredPin) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-6 animate-fade-in">
        <div className="w-full max-w-[360px] text-center">
          <p className="text-[13px] font-medium text-[#8E8E93] mb-8 tracking-wide">
            YOUR IDENTITY
          </p>

          <div className="mb-10 relative group cursor-pointer" onClick={handleCopyPin}>
            <h1 className="font-mono text-[36px] font-bold tracking-[0.15em] text-white selection:bg-white selection:text-black transition-all group-hover:scale-105 duration-300">
              {registeredPin}
            </h1>
            <div className={`absolute -bottom-8 left-1/2 -translate-x-1/2 transition-opacity duration-200 ${copied ? "opacity-100" : "opacity-0"}`}>
              <span className="text-[11px] text-[#30D158] font-medium">Copied</span>
            </div>
          </div>

          <button
            onClick={handleCopyPin}
            className="flex items-center justify-center gap-2 mx-auto px-5 py-2.5 rounded-full bg-[#1C1C1E] hover:bg-[#2C2C2E] transition-all duration-200 group"
          >
            {copied ? <Check size={14} className="text-[#30D158]" /> : <Copy size={14} className="text-[#8E8E93] group-hover:text-white" />}
            <span className={`text-[13px] font-medium ${copied ? "text-[#30D158]" : "text-[#8E8E93] group-hover:text-white"}`}>
              {copied ? "Copied" : "Copy to clipboard"}
            </span>
          </button>

          <p className="mt-12 text-[13px] text-red-500/80 font-normal leading-relaxed max-w-[280px] mx-auto text-center">
            This PIN is your only identifier using Signal Protocol. It cannot be recovered if lost.
          </p>

          <button
            onClick={onSwitchToLogin}
            className="w-full h-[48px] mt-12 bg-white text-black rounded-xl text-[15px] font-semibold hover:bg-[#F2F2F7] active:scale-[0.98] transition-all duration-200 ease-out flex items-center justify-center gap-2 shadow-lg shadow-white/5"
          >
            <span>Continue to Login</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  const isFormValid = username.length >= 3 && password.length >= 8 && confirmPassword.length >= 8;

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="space-y-4">
          <div className="relative">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onFocus={() => setIsFocused("username")}
              onBlur={() => setIsFocused(null)}
              placeholder="Username"
              autoComplete="username"
              maxLength={32}
              className={`
                w-full h-[44px] bg-[#1C1C1E] text-white text-[15px] px-4 rounded-xl
                border transition-all duration-200 ease-out outline-none placeholder:text-[#636366] font-normal
                ${isFocused === "username" ? "border-[#3A3A3C] bg-[#2C2C2E]" : "border-transparent"}
                ${validationError && validationError.includes("Username") ? "border-red-500/50" : ""}
              `}
            />
          </div>

          <div className="relative">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setIsFocused("password")}
              onBlur={() => setIsFocused(null)}
              placeholder="Password"
              autoComplete="new-password"
              className={`
                w-full h-[44px] bg-[#1C1C1E] text-white text-[15px] px-4 rounded-xl
                border transition-all duration-200 ease-out outline-none placeholder:text-[#636366] font-normal
                ${isFocused === "password" ? "border-[#3A3A3C] bg-[#2C2C2E]" : "border-transparent"}
                ${validationError && validationError.includes("Password") ? "border-red-500/50" : ""}
              `}
            />
          </div>

          <div className="relative">
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onFocus={() => setIsFocused("confirm")}
              onBlur={() => setIsFocused(null)}
              placeholder="Confirm Password"
              autoComplete="new-password"
              className={`
                w-full h-[44px] bg-[#1C1C1E] text-white text-[15px] px-4 rounded-xl
                border transition-all duration-200 ease-out outline-none placeholder:text-[#636366] font-normal
                ${isFocused === "confirm" ? "border-[#3A3A3C] bg-[#2C2C2E]" : "border-transparent"}
                ${validationError && validationError.includes("match") ? "border-red-500/50" : ""}
              `}
            />
          </div>
        </div>

        {(validationError || error) && (
          <div className="mt-1 text-center animate-fade-in">
            <p className="text-[13px] text-red-500 font-medium">{validationError || error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`
            w-full h-[44px] mt-2 rounded-xl text-[15px] font-semibold text-black transition-all duration-200 ease-out
            ${loading
              ? "bg-[#2C2C2E] text-[#48484A] cursor-not-allowed"
              : "bg-white hover:bg-[#F2F2F7] active:scale-[0.98] shadow-lg shadow-white/5"}
          `}
        >
          {loading ? "Creating Account..." : "Create Account"}
        </button>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-[13px] text-[#8E8E93] hover:text-white transition-colors duration-200"
          >
            Log in instead
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
