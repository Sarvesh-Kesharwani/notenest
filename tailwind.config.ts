import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        duo: {
          green: "#58CC02",
          greenDark: "#4CAD01",
          greenLight: "#89E219",
          yellow: "#FFC800",
          blue: "#1CB0F6",
          red: "#FF4B4B",
          purple: "#CE82FF",
          ink: "#3C3C3C",
          soft: "#F7F7F7",
          border: "#E5E5E5",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        duo: "0 4px 0 0 rgba(0,0,0,0.08)",
        duoGreen: "0 4px 0 0 #4CAD01",
        duoBlue: "0 4px 0 0 #0E8BC7",
      },
      borderRadius: {
        duo: "1rem",
      },
    },
  },
  plugins: [],
};

export default config;
