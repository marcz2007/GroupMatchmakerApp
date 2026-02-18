import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        grapple: {
          bg: "#0a0a0f",
          surface: "#141419",
          surfaceLight: "#1e1e26",
          primary: "#5762b7",
          primaryMuted: "rgba(87, 98, 183, 0.2)",
          primaryBorder: "rgba(87, 98, 183, 0.4)",
          secondary: "#7c3aed",
          border: "rgba(255, 255, 255, 0.1)",
          divider: "rgba(255, 255, 255, 0.08)",
          success: "#10b981",
          error: "#ef4444",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
