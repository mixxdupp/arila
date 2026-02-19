import { Sidebar } from "./Sidebar";
import { ChatWindow } from "../chat/ChatWindow";
import { useChatStore } from "../../stores/chatStore";

export function AppLayout() {
    const activeContactId = useChatStore((s) => s.activeContactId);

    return (
        <div className="flex h-full w-full bg-black overflow-hidden relative">
            {/* Sidebar Panel */}
            <div
                className={`
          flex-col h-full w-full md:w-[320px] shrink-0 border-r border-[#0A0A0A] bg-black
          transition-transform duration-300 ease-in-out absolute md:relative z-10
          ${activeContactId ? "-translate-x-full md:translate-x-0" : "translate-x-0"}
        `}
            >
                <Sidebar />
            </div>

            {/* Chat Window Panel */}
            <div
                className={`
          flex flex-col h-full w-full min-w-0 bg-black absolute md:relative z-0 md:z-0
          transition-transform duration-300 ease-in-out
          ${activeContactId ? "translate-x-0" : "translate-x-full md:translate-x-0"}
        `}
            >
                <ChatWindow />
            </div>
        </div>
    );
}
