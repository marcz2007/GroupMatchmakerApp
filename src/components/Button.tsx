import React from 'react';
import { ActivityIndicator, Text, TextStyle, TouchableOpacity, ViewStyle } from 'react-native';
import { tw } from '../utils/tailwind';

type ButtonVariant = 
  | 'primary'    // Filled button with background color
  | 'secondary'  // Outlined button with border
  | 'text'       // Text only, no background or border
  | 'link'       // Text with underline
  | 'ghost'      // Text with hover effect
  | 'danger'     // Red variant for destructive actions
  | 'success'    // Green variant for success actions
  | 'warning';   // Yellow/Orange variant for warnings

type ButtonSize = 'sm' | 'md' | 'lg';

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
  variant = 'primary',
  size = 'md',
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

  // Variant styles
  const variantStyles = {
    primary: tw`bg-blue-600 active:bg-blue-700`,
    secondary: tw`border-2 border-blue-600 active:bg-blue-50`,
    text: tw`active:bg-blue-50`,
    link: tw`active:bg-blue-50`,
    ghost: tw`active:bg-gray-100`,
    danger: tw`bg-red-600 active:bg-red-700`,
    success: tw`bg-green-600 active:bg-green-700`,
    warning: tw`bg-yellow-500 active:bg-yellow-600`,
  };

  // Text color styles
  const textColorStyles = {
    primary: { color: '#ffffff' },
    secondary: { color: '#2563eb' },
    text: { color: '#2563eb' },
    link: { color: '#2563eb', textDecorationLine: 'underline' },
    ghost: { color: '#374151' },
    danger: { color: '#ffffff' },
    success: { color: '#ffffff' },
    warning: { color: '#ffffff' },
  };

  // Disabled styles
  const disabledStyles = disabled ? tw`opacity-50` : '';

  // Width styles
  const widthStyles = fullWidth ? tw`w-full` : '';

  // Combine all styles
  const buttonStyles = [
    baseStyles,
    sizeStyles[size],
    variantStyles[variant],
    disabledStyles,
    widthStyles,
    style,
  ];

  const textStyles = [
    tw`font-medium`,
    textColorStyles[variant],
    textStyle,
  ];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={buttonStyles}
    >
      {loading ? (
        <ActivityIndicator 
          color={variant === 'primary' || variant === 'danger' || variant === 'success' || variant === 'warning' ? 'white' : '#2563eb'} 
          size="small" 
        />
      ) : (
        <>
          {leftIcon && <span className="mr-2">{leftIcon}</span>}
          <Text style={textStyles}>{children}</Text>
          {rightIcon && <span className="ml-2">{rightIcon}</span>}
        </>
      )}
    </TouchableOpacity>
  );
};

// Example usage:
/*
<Button variant="primary" onPress={() => {}}>Primary Button</Button>
<Button variant="secondary" onPress={() => {}}>Secondary Button</Button>
<Button variant="text" onPress={() => {}}>Text Button</Button>
<Button variant="link" onPress={() => {}}>Link Button</Button>
<Button variant="ghost" onPress={() => {}}>Ghost Button</Button>
<Button variant="danger" onPress={() => {}}>Delete</Button>
<Button variant="success" onPress={() => {}}>Save</Button>
<Button variant="warning" onPress={() => {}}>Warning</Button>

// With icons
<Button 
  variant="primary" 
  leftIcon={<Icon name="plus" />} 
  onPress={() => {}}
>
  Add Item
</Button>

// Loading state
<Button loading variant="primary" onPress={() => {}}>Loading...</Button>

// Disabled state
<Button disabled variant="primary" onPress={() => {}}>Disabled</Button>

// Full width
<Button fullWidth variant="primary" onPress={() => {}}>Full Width</Button>

// Different sizes
<Button size="sm" variant="primary" onPress={() => {}}>Small</Button>
<Button size="md" variant="primary" onPress={() => {}}>Medium</Button>
<Button size="lg" variant="primary" onPress={() => {}}>Large</Button>
*/ 