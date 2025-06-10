import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors, spacing, typography } from '../../theme';

interface VisibilityToggleProps {
  isVisible: boolean;
  onToggle: () => void;
  label: string;
}

export const VisibilityToggle: React.FC<VisibilityToggleProps> = ({
  isVisible,
  onToggle,
  label,
}) => (
  <TouchableOpacity 
    style={styles.visibilityToggle} 
    onPress={onToggle}
  >
    <Ionicons 
      name={isVisible ? "eye" : "eye-off"} 
      size={20} 
      color={isVisible ? colors.primary : colors.text.secondary} 
    />
    <Text style={[
      typography.caption,
      { 
        color: isVisible ? colors.primary : colors.text.secondary,
        marginLeft: spacing.xs
      }
    ]}>
      {isVisible ? "Public" : "Private"}
    </Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  visibilityToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xs,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
}); 