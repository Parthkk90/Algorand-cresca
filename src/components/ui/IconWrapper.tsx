import React from 'react';
import { HugeiconsIcon, IconSvgElement } from '@hugeicons/react-native';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';

interface IconWrapperProps {
  icon: IconSvgElement;
  size?: number;
  color?: string;
  focused?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function IconWrapper({
  icon: Icon,
  size = 24,
  color,
  focused,
  style,
  accessibilityLabel,
}: IconWrapperProps) {
  // Teal/Turquoise accent for focused, muted gray for unfocused
  const defaultColor = focused ? "#00D9C0" : "#6B7280"; 
  const finalColor = color || defaultColor;

  if (!Icon) {
    return (
      <View
        style={[styles.container, style]}
        accessible={!!accessibilityLabel}
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
      />
    );
  }

  return (
    <View 
      style={[styles.container, style]} 
      accessible={!!accessibilityLabel} 
      accessibilityRole="image" 
      accessibilityLabel={accessibilityLabel}
    >
      <HugeiconsIcon icon={Icon} size={size} color={finalColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
  },
});
