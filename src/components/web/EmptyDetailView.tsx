import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme";

interface EmptyDetailViewProps {
  message: string;
  icon?: string;
}

const EmptyDetailView = ({ message, icon = "chatbubbles-outline" }: EmptyDetailViewProps) => {
  return (
    <View style={styles.container}>
      <Ionicons name={icon as any} size={64} color={colors.text.tertiary} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: 32,
  },
  message: {
    fontSize: 16,
    color: colors.text.tertiary,
    marginTop: 16,
    textAlign: "center",
  },
});

export default EmptyDetailView;
