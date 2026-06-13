import { useState, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { RegisterForm } from "./components/auth/RegisterForm";
import { LoginForm } from "./components/auth/LoginForm";
import { AppLayout } from "./components/layout/AppLayout";
import { useAuth } from "./hooks/useAuth";
import { Analytics } from "@vercel/analytics/react";


type AuthView = "login" | "register";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("React error:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center bg-black p-8">
          <div className="text-center">
            <p className="text-[13px] text-danger font-medium mb-2">Something went wrong</p>
            <p className="text-[11px] text-text-secondary font-mono break-all">{this.state.error.message}</p>
            <button onClick={() => this.setState({ error: null })} className="mt-4 text-[11px] text-white underline decoration-white/30 hover:decoration-white transition-all">Try again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AuthScreen() {
  const [view, setView] = useState<AuthView>("register");

  if (view === "register") {
    return <RegisterForm onSwitchToLogin={() => setView("login")} />;
  }

  return <LoginForm onSwitchToRegister={() => setView("register")} />;
}

export function App() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="h-full bg-black text-white selection:bg-white selection:text-black">
      <ErrorBoundary>
        {isAuthenticated ? <AppLayout /> : <AuthScreen />}
      </ErrorBoundary>
      <Analytics />
    </div>
  );
}
