export const colors = {
  primary: "#5762b7",
  background: "#FFFFFF",
  text: {
    primary: "#000000",
    secondary: "#555555",
    tertiary: "#777777",
  },
  border: "#ccc",
  divider: "#ddd",
  disabled: "#b5b5b5",
  white: "#ffffff",
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
