import { ReactNode } from "react";

interface AuthLayoutProps {
    children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
    return (
        <div className="min-h-screen w-full bg-black text-white flex items-center justify-center p-6 selection:bg-white selection:text-black">
            <div className="w-full max-w-[360px] animate-fade-in flex flex-col items-center">
                {/* Header */}
                <div className="text-center mb-16">
                    <h1 className="text-[32px] font-bold tracking-[0.05em] text-white">
                        ARILA.
                    </h1>
                </div>

                {/* Content Card (Transparent/Black) */}
                <div className="w-full">
                    {children}
                </div>

                {/* Footer simple text */}
                <div className="mt-12 opacity-20">
                    <p className="text-[10px] font-mono tracking-widest text-center">SECURE ENCRYPTED MESSAGING</p>
                </div>
            </div>
        </div>
    );
}
