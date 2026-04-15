import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';

export type AppNoticeTone = 'info' | 'success' | 'error';

export type AppNoticeAction = {
  label: string;
  style?: 'primary' | 'secondary' | 'danger';
  onPress?: () => void;
};

type Props = {
  visible: boolean;
  title: string;
  message: string;
  tone?: AppNoticeTone;
  actions?: AppNoticeAction[];
  onClose: () => void;
};

export function AppNoticeModal({
  visible,
  title,
  message,
  tone = 'info',
  actions,
  onClose,
}: Props) {
  const resolvedActions = actions?.length
    ? actions
    : [{ label: 'OK', style: 'primary' as const }];

  const toneColor =
    tone === 'success'
      ? Colors.gain
      : tone === 'error'
        ? Colors.loss
        : Colors.primary;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={[styles.toneBar, { backgroundColor: toneColor }]} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.actionsWrap}>
            {resolvedActions.map((action, idx) => {
              const variant = action.style ?? 'secondary';
              return (
                <TouchableOpacity
                  key={`${action.label}-${idx}`}
                  style={[
                    styles.actionBtn,
                    variant === 'primary' && styles.actionBtnPrimary,
                    variant === 'danger' && styles.actionBtnDanger,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => {
                    onClose();
                    action.onPress?.();
                  }}
                >
                  <Text
                    style={[
                      styles.actionText,
                      variant === 'primary' && styles.actionTextPrimary,
                      variant === 'danger' && styles.actionTextDanger,
                    ]}
                  >
                    {action.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  card: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
  },
  toneBar: {
    width: 44,
    height: 4,
    borderRadius: Radius.full,
    marginBottom: Spacing.md,
  },
  title: {
    color: Colors.text.primary,
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
  },
  message: {
    color: Colors.text.secondary,
    fontSize: Typography.sm,
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
  actionsWrap: {
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  actionBtn: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg.subtle,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionBtnPrimary: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  actionBtnDanger: {
    backgroundColor: Colors.lossBg,
    borderColor: Colors.loss,
  },
  actionText: {
    color: Colors.text.primary,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  actionTextPrimary: {
    color: Colors.text.inverse,
  },
  actionTextDanger: {
    color: Colors.loss,
  },
});
