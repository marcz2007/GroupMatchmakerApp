import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface GrappleIconProps {
  width?: number;
  height?: number;
  color?: string;
  focused?: boolean;
}

const GrappleIcon: React.FC<GrappleIconProps> = ({
  width = 24,
  height = 24,
  color = '#000',
  focused = false,
}) => {
  return (
    <View style={[styles.container, { width, height }]}>
      {/* Use text to render a large "G" */}
      <Text style={[
        styles.letter, 
        { 
          color, 
          fontSize: Math.min(width, height) * 0.8,
          fontWeight: focused ? 'bold' : 'normal',
        }
      ]}>
        G
      </Text>
      
      {/* Simple hook shape as the dot */}
      <View style={[
        styles.dot,
        {
          backgroundColor: color,
          width: Math.min(width, height) * 0.2,
          height: Math.min(width, height) * 0.2,
          borderRadius: Math.min(width, height) * 0.2,
          opacity: focused ? 1 : 0.7,
          right: Math.min(width, height) * 0.15,
          top: Math.min(width, height) * 0.1,
        }
      ]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  letter: {
    fontWeight: 'bold',
  },
  dot: {
    position: 'absolute',
  }
});

export default GrappleIcon; 