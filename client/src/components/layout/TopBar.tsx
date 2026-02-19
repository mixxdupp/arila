import { PinDisplay } from "../common/PinDisplay";

interface TopBarProps {
  pin: string;
  connectionState: string;
}

export function TopBar({ pin, connectionState }: TopBarProps) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <h1 className="text-base font-bold tracking-tight">ARILA</h1>
      <div className="flex items-center gap-3">
        {connectionState !== "open" && (
          <span className="text-[10px] text-danger">
            {connectionState === "connecting" ? "connecting..." : "disconnected"}
          </span>
        )}
        <PinDisplay pin={pin} />
      </div>
    </div>
  );
}
