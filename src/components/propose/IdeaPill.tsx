import React, { useRef, useEffect } from "react";
import { StyleSheet, Text, View, Animated } from "react-native";
import { colors, spacing, borderRadius } from "../../theme";

interface IdeaPillProps {
  title: string;
  animateIn?: boolean;
}

export const IdeaPill: React.FC<IdeaPillProps> = ({
  title,
  animateIn = true,
}) => {
  const scaleAnim = useRef(new Animated.Value(animateIn ? 1.1 : 1)).current;
  const opacityAnim = useRef(new Animated.Value(animateIn ? 0 : 1)).current;

  useEffect(() => {
    if (animateIn) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [animateIn]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>💡</Text>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(87, 98, 183, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(87, 98, 183, 0.4)",
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: "90%",
    alignSelf: "center",
  },
  iconContainer: {
    marginRight: spacing.sm,
  },
  icon: {
    fontSize: 16,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.primary,
    flexShrink: 1,
  },
});
