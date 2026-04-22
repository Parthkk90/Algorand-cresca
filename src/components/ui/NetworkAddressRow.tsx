import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { C, R, T } from "../../theme";

type NetworkAddressRowProps = {
  networkName: string;
  address: string;
  networkColor?: string;
  onCopy?: (address: string) => void | Promise<void>;
  onQr?: () => void;
  onToast?: (message: string) => void;
  onPress?: () => void;
  hideActions?: boolean;
  style?: StyleProp<ViewStyle>;
};

function maskAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.length <= 10) return trimmed;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

export function NetworkAddressRow({
  networkName,
  address,
  networkColor = C.networks.algorand,
  onCopy,
  onQr,
  onToast,
  onPress,
  hideActions = false,
  style,
}: NetworkAddressRowProps) {
  const handleCopy = async () => {
    if (onCopy) {
      await onCopy(address);
      return;
    }

    await Clipboard.setStringAsync(address);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (onToast) {
      onToast("Copied");
      return;
    }

    if (Platform.OS === "android") {
      ToastAndroid.show("Copied", ToastAndroid.SHORT);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.row, style]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.85}
    >
      <View style={styles.leftWrap}>
        <View style={[styles.networkCircle, { backgroundColor: networkColor }]} />
        <View>
          <Text style={styles.networkName}>{networkName}</Text>
          <Text style={styles.addressText}>{maskAddress(address)}</Text>
        </View>
      </View>

      {!hideActions ? (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => void handleCopy()}
            accessibilityRole="button"
            accessibilityLabel="Copy address"
          >
            <Ionicons name="copy-outline" size={16} color={C.text.t2} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={onQr}
            disabled={!onQr}
            accessibilityRole="button"
            accessibilityLabel="Show QR code"
          >
            <Ionicons name="qr-code-outline" size={16} color={C.text.t2} />
          </TouchableOpacity>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={C.text.t3} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 64,
    borderBottomWidth: 1,
    borderBottomColor: C.borders.bDefault,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leftWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 12,
  },
  networkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  networkName: {
    ...T.bodyMd,
    color: C.text.t1,
  },
  addressText: {
    ...T.address,
    color: C.text.t2,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: R.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaces.bgSurface,
  },
});
