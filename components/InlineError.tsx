// components/InlineError.tsx
// Animated field-level error message that fades in below inputs.
// Replaces Alert.alert() for all form validation errors.

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { Colors, Typography } from '../constants/theme';

interface InlineErrorProps {
  message: string | null;
}

export function InlineError({ message }: InlineErrorProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: message ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [message, opacity]);

  if (!message) return null;

  return (
    <Animated.View style={{ opacity }}>
      <Text
        style={styles.text}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: Typography.xs,
    color: Colors.loss,
    marginTop: 4,
    marginBottom: 4,
  },
});
