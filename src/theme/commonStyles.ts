import { StyleSheet } from "react-native";
import { borderRadius, colors, spacing, typography } from "./theme";

export const commonStyles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  title: {
    ...typography.title,
    marginBottom: spacing.xl,
    textAlign: "center",
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.sectionTitle,
    marginBottom: spacing.sm,
  },
  sectionDescription: {
    ...typography.body,
    color: colors.text.secondary,
    marginBottom: spacing.lg,
  },
  searchInput: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontSize: typography.body.fontSize,
    backgroundColor: colors.white,
    marginBottom: spacing.md,
  },
  button: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  disabledButton: {
    backgroundColor: colors.disabled,
  },
  buttonText: {
    color: colors.white,
    fontSize: typography.body.fontSize,
    fontWeight: "bold",
  },
  caption: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.lg,
  },
});
