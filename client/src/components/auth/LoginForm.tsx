import { useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import { AuthLayout } from "./AuthLayout";

export function LoginForm({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isFocused, setIsFocused] = useState<"username" | "password" | null>(null);

  const { login, loading, error, clearError } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (username.length < 3 || password.length < 1) {
      return;
    }

    try {
      await login(username, password);
    } catch {
      // Error is set in the store
    }
  };

  const isFormValid = username.length >= 3 && password.length >= 1;

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="space-y-4">
          <div className="relative group">
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
                ${error ? "border-red-500/50" : ""}
              `}
            />
          </div>

          <div className="relative group">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setIsFocused("password")}
              onBlur={() => setIsFocused(null)}
              placeholder="Password"
              autoComplete="current-password"
              className={`
                w-full h-[44px] bg-[#1C1C1E] text-white text-[15px] px-4 rounded-xl
                border transition-all duration-200 ease-out outline-none placeholder:text-[#636366] font-normal
                ${isFocused === "password" ? "border-[#3A3A3C] bg-[#2C2C2E]" : "border-transparent"}
                ${error ? "border-red-500/50" : ""}
              `}
            />
          </div>
        </div>

        {error && (
          <div className="mt-1 text-center animate-fade-in">
            <p className="text-[13px] text-red-500 font-medium">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !isFormValid}
          className={`
            w-full h-[44px] mt-2 rounded-xl text-[15px] font-semibold text-black transition-all duration-200 ease-out
            ${loading || !isFormValid
              ? "bg-[#2C2C2E] text-[#48484A] cursor-not-allowed"
              : "bg-white hover:bg-[#F2F2F7] active:scale-[0.98] shadow-lg shadow-white/5"}
          `}
        >
          {loading ? "Authenticating..." : "Login"}
        </button>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="text-[13px] text-[#8E8E93] hover:text-white transition-colors duration-200"
          >
            Create an account
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
