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

type StatCardProps = {
  label: string;
  value: string;
  changePct?: number;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  valueStyle?: StyleProp<TextStyle>;
};

export function StatCard({
  label,
  value,
  changePct,
  style,
  labelStyle,
  valueStyle,
}: StatCardProps) {
  const positive = changePct != null ? changePct >= 0 : null;

  return (
    <View style={[styles.card, style]}>
      <Text style={[styles.label, labelStyle]}>{label}</Text>
      <Text style={[styles.value, valueStyle]}>{value}</Text>

      {changePct != null ? (
        <View
          style={[
            styles.badge,
            positive ? styles.badgePositive : styles.badgeNegative,
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              positive ? styles.badgeTextPositive : styles.badgeTextNegative,
            ]}
          >
            {positive ? "+" : ""}
            {changePct.toFixed(2)}%
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surfaces.bgSurface,
    borderRadius: R.md,
    padding: 12,
    gap: 4,
  },
  label: {
    ...T.sm,
    color: C.text.t2,
  },
  value: {
    ...T.h3,
    color: C.text.t1,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: R.full,
    marginTop: 2,
  },
  badgePositive: {
    backgroundColor: "rgba(18,183,106,0.08)",
  },
  badgeNegative: {
    backgroundColor: "rgba(240,68,56,0.08)",
  },
  badgeText: {
    ...T.smBold,
  },
  badgeTextPositive: {
    color: C.semantic.success,
  },
  badgeTextNegative: {
    color: C.semantic.danger,
  },
});
