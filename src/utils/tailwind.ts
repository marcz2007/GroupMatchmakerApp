import { StyleSheet } from "react-native";

// Define a type for the template literal tag function
type TailwindFunction = (
  strings: TemplateStringsArray,
  ...values: any[]
) => any;

// Create a function that converts Tailwind classes to React Native styles
const createTailwindStyle = (classes: string): any => {
  const styles: { [key: string]: any } = {};

  // Split classes into individual class names
  const classNames = classes.split(" ");

  classNames.forEach((className) => {
    // Handle flex
    if (className === "flex") styles.flex = 1;
    if (className === "flex-row") styles.flexDirection = "row";

    // Handle items and justify
    if (className === "items-center") styles.alignItems = "center";
    if (className === "justify-center") styles.justifyContent = "center";

    // Handle padding
    if (className.startsWith("px-")) {
      const value = parseInt(className.split("-")[1]);
      styles.paddingHorizontal = value * 4;
    }
    if (className.startsWith("py-")) {
      const value = parseInt(className.split("-")[1]);
      styles.paddingVertical = value * 4;
    }

    // Handle margin
    if (className.startsWith("mx-")) {
      const value = parseInt(className.split("-")[1]);
      styles.marginHorizontal = value * 4;
    }
    if (className.startsWith("my-")) {
      const value = parseInt(className.split("-")[1]);
      styles.marginVertical = value * 4;
    }

    // Handle width
    if (className === "w-full") styles.width = "100%";

    // Handle border radius
    if (className === "rounded-lg") styles.borderRadius = 8;

    // Handle background colors
    if (className.startsWith("bg-")) {
      const color = className.split("-")[1];
      const shade = className.split("-")[2];
      styles.backgroundColor = getColorValue(color, shade);
    }

    // Handle text colors
    if (className.startsWith("text-")) {
      const color = className.split("-")[1];
      const shade = className.split("-")[2];
      if (color === "white") {
        styles.color = "#ffffff";
      } else {
        styles.color = getColorValue(color, shade);
      }
    }

    // Handle border
    if (className.startsWith("border-")) {
      const value = parseInt(className.split("-")[1]);
      styles.borderWidth = value;
    }

    // Handle opacity
    if (className.startsWith("opacity-")) {
      const value = parseInt(className.split("-")[1]);
      styles.opacity = value / 100;
    }

    // Handle text decoration
    if (className === "underline") styles.textDecorationLine = "underline";

    // Handle font weight
    if (className === "font-medium") styles.fontWeight = "500";
  });

  return StyleSheet.create({ style: styles }).style;
};

// Helper function to convert Tailwind color names to hex values
const getColorValue = (color: string, shade: string): string => {
  const colors: { [key: string]: { [key: string]: string } } = {
    blue: {
      "50": "#eff6ff",
      "100": "#dbeafe",
      "200": "#bfdbfe",
      "300": "#93c5fd",
      "400": "#60a5fa",
      "500": "#3b82f6",
      "600": "#2563eb",
      "700": "#1d4ed8",
      "800": "#1e40af",
      "900": "#1e3a8a",
    },
    red: {
      "600": "#dc2626",
      "700": "#b91c1c",
    },
    green: {
      "600": "#16a34a",
      "700": "#15803d",
    },
    yellow: {
      "500": "#eab308",
      "600": "#ca8a04",
    },
    gray: {
      "100": "#f3f4f6",
      "700": "#374151",
    },
    white: {
      "": "#ffffff",
    },
  };

  return colors[color]?.[shade] || "#000000";
};

// Create the template literal tag function
export const tw: TailwindFunction = (strings, ...values) => {
  const classes = strings.reduce((result, string, i) => {
    return result + string + (values[i] || "");
  }, "");

  return createTailwindStyle(classes);
};
