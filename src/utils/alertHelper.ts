import { Alert, Platform } from "react-native";

/**
 * Cross-platform confirmation dialog.
 *
 * React Native Web's Alert.alert only renders a single OK button —
 * custom button arrays are silently ignored, so callbacks never fire.
 * This helper uses window.confirm on web and Alert.alert on native.
 */
export function confirmAlert(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmLabel = "OK"
): void {
  if (Platform.OS === "web") {
    const result = window.confirm(`${title}\n\n${message}`);
    if (result) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: confirmLabel, onPress: onConfirm },
    ]);
  }
}

/**
 * Cross-platform alert with two action buttons (e.g. "Try Again" / "Reset Password").
 *
 * On web: shows confirm dialog; Cancel → onCancel, OK → onAction.
 * On native: shows standard Alert with both buttons.
 */
export function twoButtonAlert(
  title: string,
  message: string,
  cancelLabel: string,
  actionLabel: string,
  onAction: () => void,
  onCancel?: () => void
): void {
  if (Platform.OS === "web") {
    // window.confirm maps OK → action, Cancel → cancel
    const result = window.confirm(`${title}\n\n${message}\n\nPress OK to ${actionLabel.toLowerCase()}.`);
    if (result) {
      onAction();
    } else {
      onCancel?.();
    }
  } else {
    Alert.alert(title, message, [
      { text: cancelLabel, style: "cancel", onPress: onCancel },
      { text: actionLabel, onPress: onAction },
    ]);
  }
}
