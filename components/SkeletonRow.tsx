// components/SkeletonRow.tsx
// Shimmer skeleton for loading states. Uses LinearGradient + Animated.
// TxSkeletonRow is a convenience wrapper shaped like a tx history row.

import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { Colors } from '../constants/theme';

interface SkeletonRowProps {
  style?: ViewStyle;
  height?: number;
  width?: number | string;
  borderRadius?: number;
}

export function SkeletonRow({
  style,
  height = 16,
  width = '100%',
  borderRadius = 8,
}: SkeletonRowProps) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [shimmer]);

  const translateX = shimmer.interpolate({
    inputRange:  [0, 1],
    outputRange: [-300, 300],
  });

  return (
    <View
      style={[
        styles.base,
        { height, width: width as any, borderRadius },
        style,
      ]}
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}
      >
        <LinearGradient
          colors={[Colors.bg.card, Colors.bg.subtle, Colors.bg.card]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

// Convenience: full tx-history row skeleton matching the real row layout
export function TxSkeletonRow() {
  return (
    <View style={styles.txRow}>
      <SkeletonRow height={36} width={36} borderRadius={18} />
      <View style={styles.txMid}>
        <SkeletonRow height={13} width="60%" borderRadius={6} />
        <SkeletonRow height={11} width="40%" borderRadius={6} style={styles.txSubLine} />
      </View>
      <SkeletonRow height={13} width={60} borderRadius={6} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.bg.card,
    overflow: 'hidden',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  txMid: {
    flex: 1,
    gap: 6,
  },
  txSubLine: {
    marginTop: 6,
  },
});
