import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface GrappleIconProps {
  width?: number;
  height?: number;
  color?: string;
  focused?: boolean;
}

const GrappleIcon: React.FC<GrappleIconProps> = ({
  width = 24,
  height = 24,
  color = "#000",
  focused = false,
}) => {
  return (
    <View style={[styles.container, { width, height }]}>
      {/* Shimmer effect when focused */}
      {focused && (
        <View
          style={[
            styles.shimmer,
            {
              width: width * 1.5,
              height: height * 1.5,
              borderRadius: width * 0.75,
            },
          ]}
        />
      )}

      {/* Use text to render a large "G" */}
      <Text
        style={[
          styles.letter,
          {
            color,
            fontSize: Math.min(width, height) * 0.8,
            fontWeight: focused ? "bold" : "normal",
          },
        ]}
      >
        G
      </Text>

      {/* Simple hook shape as the dot */}
      <View
        style={[
          styles.dot,
          {
            backgroundColor: color,
            width: Math.min(width, height) * 0.2,
            height: Math.min(width, height) * 0.2,
            borderRadius: Math.min(width, height) * 0.2,
            opacity: focused ? 1 : 0.7,
            right: Math.min(width, height) * 0.15,
            top: Math.min(width, height) * 0.1,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  letter: {
    position: "relative",
    zIndex: 2,
  },
  dot: {
    position: "absolute",
    zIndex: 2,
  },
  shimmer: {
    position: "absolute",
    backgroundColor: "rgba(255, 215, 0, 0.15)", // Subtle gold color
    zIndex: 1,
  },
});

export default GrappleIcon;
