export const colors = {
  primary: "#5762b7",
  secondary: "#7c3aed",
  background: "#1a1a1a", // Anthracite grey
  surface: "#2a2a2a", // Slightly lighter anthracite
  surfaceLight: "#3a3a3a", // Even lighter for elevated surfaces
  text: {
    primary: "#ffffff", // White for primary text
    secondary: "#e0e0e0", // Light grey for secondary text
    tertiary: "#b0b0b0", // Medium grey for tertiary text
  },
  border: "#404040",
  divider: "#333333",
  disabled: "#555555",
  error: "#ef4444",
  success: "#10b981",
  warning: "#f59e0b",
  accent: "#8b5cf6",
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
