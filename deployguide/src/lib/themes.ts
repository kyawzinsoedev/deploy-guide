export const themes = [
  { id: "paper", name: "Paper Light", color: "#f8faf7" },
  { id: "midnight", name: "Midnight Blue", color: "#142237" },
  { id: "forest", name: "Forest Terminal", color: "#142b25" },
  { id: "sand", name: "Warm Sand", color: "#f1e8d7" },
] as const;
export type ThemeId = (typeof themes)[number]["id"];
