import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    fontFamily: {
      sans: ['"Space Grotesk"', "sans-serif"],
    },
    extend: {
      colors: {
        bg: {
          primary: "#000000",
          secondary: "#0A0A0A",
          tertiary: "#111111",
        },
        text: {
          primary: "#FFFFFF",
          secondary: "#999999",
          muted: "#555555",
        },
        accent: "#FFFFFF",
        border: "#1A1A1A",
        sent: "#1A1A1A",
        received: "#0A0A0A",
        danger: "#FF3B30",
        success: "#30D158",
      },
    },
  },
  plugins: [],
} satisfies Config;
