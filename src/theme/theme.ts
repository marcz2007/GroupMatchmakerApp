export const colors = {
  primary: "#5762b7",
  secondary: "#7c3aed",
  background: "#1a1a1a",
  surface: "#2a2a2a",
  surfaceLight: "#3a3a3a",
  text: {
    primary: "#ffffff",
    secondary: "#e0e0e0",
    tertiary: "#b0b0b0",
  },
  border: "#404040",
  divider: "#333333",
  disabled: "#555555",
  white: "#ffffff",
  error: "#ef4444",
  success: "#10b981",
  warning: "#f59e0b",
  accent: "#8b5cf6",
};

export const spacing = {
  xs: 5,
  sm: 10,
  md: 15,
  lg: 20,
  xl: 30,
};

export const typography = {
  title: {
    fontSize: 28,
    fontWeight: "700" as const,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "700" as const,
  },
  body: {
    fontSize: 16,
  },
  caption: {
    fontSize: 12,
    fontStyle: "italic" as const,
  },
};

export const borderRadius = {
  sm: 5,
  md: 10,
};

export const shadows = {
  small: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 2,
  },
};
