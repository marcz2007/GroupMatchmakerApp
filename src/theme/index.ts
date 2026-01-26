export const colors = {
  // Core palette - Deep space aesthetic
  primary: "#5762b7",
  primaryMuted: "rgba(87, 98, 183, 0.2)",
  primaryBorder: "rgba(87, 98, 183, 0.4)",
  secondary: "#7c3aed",

  // Backgrounds - True blacks for depth
  background: "#0a0a0f", // Deep black (matches ProposeScreen)
  backgroundGradient: ["#1a1a2e", "#0a0a0f", "#0a0a0f"] as const, // Gradient colors
  surface: "#141419", // Slightly elevated surface
  surfaceLight: "#1e1e26", // Cards and elevated elements
  surfaceGlass: "rgba(255, 255, 255, 0.05)", // Glassmorphic surfaces

  // Text hierarchy
  text: {
    primary: "#ffffff",
    secondary: "#e0e0e0",
    tertiary: "#6b7280", // Muted gray for hints
  },

  // Borders - Subtle and minimal
  border: "rgba(255, 255, 255, 0.1)",
  borderLight: "rgba(255, 255, 255, 0.05)",
  divider: "rgba(255, 255, 255, 0.08)",

  // States
  disabled: "#3a3a4a",
  error: "#ef4444",
  success: "#10b981",
  warning: "#f59e0b",
  accent: "#8b5cf6",

  // Event-specific
  eventActive: "#10b981",
  eventBadge: "#ef4444",

  // Alias for backwards compatibility
  white: "#ffffff",
};

export const typography = {
  h1: {
    fontSize: 34,
    fontWeight: "700" as const,
  },
  h2: {
    fontSize: 28,
    fontWeight: "700" as const,
  },
  h3: {
    fontSize: 22,
    fontWeight: "600" as const,
  },
  // Aliases for backwards compatibility with theme.ts
  title: {
    fontSize: 28,
    fontWeight: "700" as const,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "700" as const,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 17,
    fontWeight: "400" as const,
  },
  caption: {
    fontSize: 15,
    fontWeight: "400" as const,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
};
