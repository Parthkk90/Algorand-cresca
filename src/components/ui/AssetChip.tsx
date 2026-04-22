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

type AssetChipProps = {
  symbol: string;
  networkColor?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function AssetChip({
  symbol,
  networkColor = C.networks.algorand,
  style,
  textStyle,
}: AssetChipProps) {
  return (
    <View style={[styles.chip, style]}>
      <View style={[styles.dot, { backgroundColor: networkColor }]} />
      <Text style={[styles.text, textStyle]}>{symbol}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.surfaces.bgSurface,
    borderRadius: R.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    ...T.smBold,
    color: C.text.t1,
  },
});
