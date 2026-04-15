// components/HapticButton.tsx
// Drop-in Pressable with Reanimated spring scale + expo-haptics feedback.
// Replaces TouchableOpacity on all primary action buttons.

import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Anim } from '../constants/theme';

interface HapticButtonProps {
  onPress: () => void;
  style?: ViewStyle | ViewStyle[];
  children: React.ReactNode;
  disabled?: boolean;
  hapticStyle?: Haptics.ImpactFeedbackStyle;
  scaleDown?: number;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function HapticButton({
  onPress,
  style,
  children,
  disabled = false,
  hapticStyle = Haptics.ImpactFeedbackStyle.Light,
  scaleDown = 0.96,
  accessibilityLabel,
  accessibilityHint,
}: HapticButtonProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(scaleDown, Anim.spring);
    void Haptics.impactAsync(hapticStyle);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, Anim.spring);
  };

  return (
    <AnimatedPressable
      onPress={disabled ? undefined : onPress}
      onPressIn={disabled ? undefined : handlePressIn}
      onPressOut={disabled ? undefined : handlePressOut}
      style={[animStyle, disabled && styles.disabled, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
    >
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.5 },
});
