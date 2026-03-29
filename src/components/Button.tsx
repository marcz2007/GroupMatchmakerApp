import React from "react";
import {
  ActivityIndicator,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { tw } from "../utils/tailwind";

type ButtonVariant =
  | "primary" // Filled button with background color
  | "secondary" // Outlined button with border
  | "text" // Text only, no background or border
  | "link" // Text with underline
  | "ghost" // Text with hover effect
  | "danger" // Red variant for destructive actions
  | "success" // Green variant for success actions
  | "warning"; // Yellow/Orange variant for warnings

type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  onPress: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  onPress,
  children,
  disabled = false,
  loading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  style,
  textStyle,
}) => {
  // Base styles for all buttons
  const baseStyles = tw`flex-row items-center justify-center rounded-lg`;

  // Size styles
  const sizeStyles = {
    sm: tw`px-3 py-1.5`,
    md: tw`px-4 py-2`,
    lg: tw`px-6 py-3`,
  };

  // Variant styles - updated for dark theme
  const variantStyles = {
    primary: tw`bg-blue-600 active:bg-blue-700`,
    secondary: tw`border-2 border-blue-600 bg-gray-800 active:bg-gray-700`,
    text: tw`active:bg-gray-800`,
    link: tw`active:bg-gray-800`,
    ghost: tw`active:bg-gray-800`,
    danger: tw`bg-red-600 active:bg-red-700`,
    success: tw`bg-green-600 active:bg-green-700`,
    warning: tw`bg-yellow-500 active:bg-yellow-600`,
  };

  // Text color styles - updated for dark theme
  const textColorStyles = {
    primary: { color: "#ffffff" },
    secondary: { color: "#ffffff" },
    text: { color: "#ffffff" },
    link: { color: "#3b82f6", textDecorationLine: "underline" },
    ghost: { color: "#ffffff" },
    danger: { color: "#ffffff" },
    success: { color: "#ffffff" },
    warning: { color: "#ffffff" },
  };

  // Disabled styles
  const disabledStyles = disabled ? tw`opacity-50` : "";

  // Width styles
  const widthStyles = fullWidth ? tw`w-full` : "";

  // Combine all styles
  const buttonStyles = [
    baseStyles,
    sizeStyles[size],
    variantStyles[variant],
    disabledStyles,
    widthStyles,
    style,
  ];

  const textStyles = [tw`font-medium`, textColorStyles[variant], textStyle];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={buttonStyles}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === "primary" ||
            variant === "danger" ||
            variant === "success" ||
            variant === "warning"
              ? "white"
              : "#ffffff"
          }
          size="small"
        />
      ) : (
        <>
          {leftIcon && <View style={{ marginRight: 8 }}>{leftIcon}</View>}
          <Text style={textStyles}>{children}</Text>
          {rightIcon && <View style={{ marginLeft: 8 }}>{rightIcon}</View>}
        </>
      )}
    </TouchableOpacity>
  );
};
