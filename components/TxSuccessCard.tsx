// components/TxSuccessCard.tsx
// Animated success card that slides+fades in after a transaction completes.
// Fires a success haptic on mount. Replaces Alert.alert('Payment sent', ...).

import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Anim, Colors, Radius, Spacing, Typography } from '../constants/theme';

interface TxSuccessCardProps {
  txId: string;
  network?: 'testnet' | 'mainnet';
  onDismiss: () => void;
}

export function TxSuccessCard({
  txId,
  network = 'testnet',
  onDismiss,
}: TxSuccessCardProps) {
  const slideY      = useRef(new Animated.Value(40)).current;
  const opacity     = useRef(new Animated.Value(0)).current;
  const checkScale  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.parallel([
      Animated.timing(slideY, {
        toValue: 0,
        duration: Anim.normal,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: Anim.normal,
        useNativeDriver: true,
      }),
      Animated.spring(checkScale, {
        toValue: 1,
        damping: 14,
        stiffness: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [slideY, opacity, checkScale]);

  const explorerUrl =
    network === 'testnet'
      ? `https://lora.algokit.io/testnet/transaction/${txId}`
      : `https://lora.algokit.io/mainnet/transaction/${txId}`;

  const shortTxId = `${txId.slice(0, 8)}...${txId.slice(-6)}`;

  return (
    <Animated.View
      style={[styles.card, { opacity, transform: [{ translateY: slideY }] }]}
    >
      <View style={styles.row}>
        <Animated.View
          style={[styles.checkCircle, { transform: [{ scale: checkScale }] }]}
        >
          <Ionicons name="checkmark" size={20} color={Colors.bg.screen} />
        </Animated.View>

        <View style={styles.textCol}>
          <Text style={styles.title}>Payment Sent</Text>
          <Text style={styles.txId}>{shortTxId}</Text>
        </View>

        <TouchableOpacity
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss success card"
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
        >
          <Ionicons name="close" size={18} color={Colors.text.muted} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.explorerBtn}
        onPress={() => void Linking.openURL(explorerUrl)}
        accessibilityRole="link"
        accessibilityLabel="View transaction on explorer"
      >
        <Text style={styles.explorerText}>View on Explorer</Text>
        <Ionicons name="open-outline" size={13} color={Colors.tertiary} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gain,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  checkCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.gain,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1 },
  title: {
    fontSize: Typography.base,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  txId: {
    fontSize: Typography.xs,
    color: Colors.text.muted,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  explorerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.sm,
  },
  explorerText: {
    fontSize: Typography.sm,
    color: Colors.tertiary,
  },
});
