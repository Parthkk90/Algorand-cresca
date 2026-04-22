import React from "react";
import {
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { C, R, T } from "../../theme";

export type StatusTagVariant = "success" | "danger" | "warning" | "info" | "purple";

type StatusTagProps = {
  label: string;
  variant?: StatusTagVariant;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const VARIANT_MAP: Record<StatusTagVariant, { bg: string; fg: string }> = {
  success: {
    bg: "rgba(18,183,106,0.08)",
    fg: C.semantic.success,
  },
  danger: {
    bg: "rgba(240,68,56,0.08)",
    fg: C.semantic.danger,
  },
  warning: {
    bg: "rgba(247,144,9,0.08)",
    fg: C.semantic.warning,
  },
  info: {
    bg: "rgba(29,78,216,0.08)",
    fg: C.semantic.info,
  },
  purple: {
    bg: "rgba(110,86,207,0.08)",
    fg: C.brand.purple,
  },
};

export function StatusTag({
  label,
  variant = "info",
  style,
  textStyle,
}: StatusTagProps) {
  const tone = VARIANT_MAP[variant];

  return (
    <View style={[styles.tag, { backgroundColor: tone.bg }, style]}>
      <Text style={[styles.text, { color: tone.fg }, textStyle]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    borderRadius: R.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: {
    ...T.smBold,
  },
});
