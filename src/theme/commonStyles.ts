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
    width: "100%",
  },
  multilineInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.body.fontSize,
    backgroundColor: colors.white,
    marginBottom: spacing.md,
    width: "100%",
    minHeight: 100,
    textAlignVertical: "top",
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
  buttonContainer: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  protectedSection: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    backgroundColor: "#f8f9fa",
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  protectedTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#495057",
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#dee2e6",
    paddingBottom: spacing.sm,
  },
  protectedContent: {
    gap: spacing.md,
  },
  protectedItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  protectedLabel: {
    fontSize: 15,
    color: "#6c757d",
    fontWeight: "500",
  },
  protectedValue: {
    fontSize: 15,
    color: "#212529",
    fontWeight: "400",
  },
  centeredContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
