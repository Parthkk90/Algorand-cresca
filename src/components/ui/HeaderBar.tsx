import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Image,
  ImageSourcePropType,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { C, T } from "../../theme";

type HeaderBarMode = "wallet" | "title";

type HeaderBarProps = {
  mode?: HeaderBarMode;
  walletName?: string;
  avatarText?: string;
  avatarSource?: ImageSourcePropType;
  showChevron?: boolean;
  onWalletPress?: () => void;

  title?: string;
  onBackPress?: () => void;

  rightSlot?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function HeaderBar({
  mode = "wallet",
  walletName = "Wallet",
  avatarText = "CW",
  avatarSource,
  showChevron = true,
  onWalletPress,
  title = "",
  onBackPress,
  rightSlot,
  style,
}: HeaderBarProps) {
  if (mode === "title") {
    return (
      <View style={[styles.base, style]}>
        <TouchableOpacity
          style={styles.iconTouch}
          onPress={onBackPress}
          disabled={!onBackPress}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color={C.text.t1} />
        </TouchableOpacity>

        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>

        <View style={styles.rightSlot}>{rightSlot}</View>
      </View>
    );
  }

  return (
    <View style={[styles.base, style]}>
      <TouchableOpacity
        style={styles.walletLeft}
        onPress={onWalletPress}
        disabled={!onWalletPress}
        accessibilityRole="button"
        accessibilityLabel="Open wallet selector"
      >
        {avatarSource ? (
          <Image source={avatarSource} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarText}>{avatarText}</Text>
          </View>
        )}

        <Text style={styles.walletName} numberOfLines={1}>
          {walletName}
        </Text>

        {showChevron ? (
          <Ionicons name="chevron-down" size={16} color={C.text.t2} />
        ) : null}
      </TouchableOpacity>

      <View style={styles.rightSlot}>{rightSlot}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 56,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.borders.bDefault,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.surfaces.bgBase,
  },
  walletLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    marginRight: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaces.bgSurface,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
  },
  avatarText: {
    ...T.smBold,
    color: C.text.t1,
  },
  walletName: {
    ...T.bodyMd,
    color: C.text.t1,
    maxWidth: 180,
  },
  iconTouch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...T.h2,
    color: C.text.t1,
    flex: 1,
    textAlign: "center",
  },
  rightSlot: {
    minWidth: 36,
    alignItems: "flex-end",
    justifyContent: "center",
  },
});
