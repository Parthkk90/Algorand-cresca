import React from "react";
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  TouchableOpacityProps,
  ViewStyle,
} from "react-native";
import { C, R, T } from "../../theme";

export type PrimaryButtonVariant = "black" | "teal" | "purple" | "outline";

type PrimaryButtonProps = Omit<TouchableOpacityProps, "style"> & {
  label: string;
  variant?: PrimaryButtonVariant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const variantStyles: Record<PrimaryButtonVariant, ViewStyle> = {
  black: {
    backgroundColor: C.brand.black,
    borderColor: C.brand.black,
    borderWidth: 1,
  },
  teal: {
    backgroundColor: C.brand.teal,
    borderColor: C.brand.teal,
    borderWidth: 1,
  },
  purple: {
    backgroundColor: C.brand.purple,
    borderColor: C.brand.purple,
    borderWidth: 1,
  },
  outline: {
    backgroundColor: C.surfaces.bgBase,
    borderColor: C.brand.black,
    borderWidth: 1,
  },
};

const textStyles: Record<PrimaryButtonVariant, TextStyle> = {
  black: { color: C.text.tInv },
  teal: { color: C.text.tInv },
  purple: { color: C.text.tInv },
  outline: { color: C.text.t1 },
};

export function PrimaryButton({
  label,
  variant = "black",
  loading = false,
  disabled,
  style,
  textStyle,
  ...touchableProps
}: PrimaryButtonProps) {
  const isDisabled = Boolean(disabled || loading);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      disabled={isDisabled}
      style={[
        styles.base,
        variantStyles[variant],
        isDisabled && styles.disabled,
        style,
      ]}
      {...touchableProps}
    >
      {loading ? (
        <ActivityIndicator color={variant === "outline" ? C.text.t1 : C.text.tInv} />
      ) : (
        <Text style={[styles.label, textStyles[variant], textStyle]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: R.full,
  },
  disabled: {
    backgroundColor: "#D1D5DB",
    borderColor: "#D1D5DB",
  },
  label: {
    ...T.btn,
  },
});
