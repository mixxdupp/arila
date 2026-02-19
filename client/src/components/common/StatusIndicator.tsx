export function StatusIndicator({ online }: { online: boolean }) {
  return (
    <div
      className={`h-2 w-2 rounded-full flex-shrink-0 transition-colors duration-200 ${online ? "bg-success" : "bg-[#333333]"
        }`}
      title={online ? "Online" : "Offline"}
    />
  );
}
