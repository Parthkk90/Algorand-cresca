import React, { useMemo, useState } from "react";
import {
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { C, R, T } from "../../theme";

type CrescaInputProps = TextInputProps & {
  label?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

export function CrescaInput({
  label,
  error,
  containerStyle,
  inputStyle,
  labelStyle,
  onFocus,
  onBlur,
  ...inputProps
}: CrescaInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  const borderColor = useMemo(() => {
    if (error) return C.semantic.danger;
    if (isFocused) return C.brand.purple;
    return C.borders.bDefault;
  }, [error, isFocused]);

  return (
    <View style={containerStyle}>
      {label ? <Text style={[styles.label, labelStyle]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={C.text.tPh}
        style={[styles.input, { borderColor }, inputStyle]}
        onFocus={(event) => {
          setIsFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setIsFocused(false);
          onBlur?.(event);
        }}
        {...inputProps}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...T.smBold,
    color: C.text.t1,
    marginBottom: 6,
  },
  input: {
    ...T.body,
    color: C.text.t1,
    backgroundColor: C.surfaces.bgSurface,
    borderWidth: 1.5,
    borderRadius: R.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  errorText: {
    ...T.sm,
    color: C.semantic.danger,
    marginTop: 6,
  },
});
