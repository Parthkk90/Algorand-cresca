import {
  ArrowLeft01Icon,
  LockKeyIcon,
  Logout01Icon,
  ViewIcon,
  ViewOffIcon,
  ArrowRight01Icon,
  ArrowDown01Icon,
  MoreHorizontalIcon,
} from '@hugeicons/core-free-icons';
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import * as ScreenCapture from "expo-screen-capture";
import * as SecureStore from "expo-secure-store";
import { algorandService } from "../services/algorandService";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { appPasswordService } from "../services/appPasswordService";
import { authEmitter } from "../utils/authEmitter";
import { ScreenContainer } from "../components/ScreenContainer";
import {
  CrescaInput,
  CrescaSheet,
  IconWrapper,
  NetworkAddressRow,
  PrimaryButton,
} from "../src/components/ui";
import { C, H_PAD, R, S, T } from "../src/theme";

type NetworkOption = {
  id: string;
  name: string;
  color: string;
  keyService: string;
  addressService: string;
  fallbackAddress: string;
  isAlgorand?: boolean;
};

const SESSION_LOCK_OPTIONS = [
  "1 min",
  "5 mins",
  "15 mins",
  "30 mins",
  "1 hour",
  "Never",
] as const;

const KEYPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"] as const;

const NETWORK_OPTIONS: NetworkOption[] = [
  {
    id: "algorand",
    name: "Algorand",
    color: "#000000",
    keyService: "cresca_private_algorand",
    addressService: "cresca_public_algorand",
    fallbackAddress: "",
    isAlgorand: true,
  },
  {
    id: "ethereum",
    name: "Ethereum",
    color: C.networks.ethereum,
    keyService: "cresca_private_ethereum",
    addressService: "cresca_public_ethereum",
    fallbackAddress: "0x7f2e5f3e0b4f8d1ac2ef2a17fef8b2d9d4a95c31",
  },
  {
    id: "bitcoin",
    name: "Bitcoin",
    color: C.networks.bitcoin,
    keyService: "cresca_private_bitcoin",
    addressService: "cresca_public_bitcoin",
    fallbackAddress: "bc1q4r9xdu9x7mf8nlf3v8m8u89j6d2v8r2g3w4jxf",
  },
  {
    id: "oktc",
    name: "OKTC",
    color: "#3A7BFF",
    keyService: "cresca_private_oktc",
    addressService: "cresca_public_oktc",
    fallbackAddress: "0x89b4f67f8f39e2f4fd1e84b6abbb9d0d4f31be8a",
  },
  {
    id: "bnb",
    name: "BNB Chain",
    color: C.networks.bnb,
    keyService: "cresca_private_bnb",
    addressService: "cresca_public_bnb",
    fallbackAddress: "0x1d8f6f2ea49a2c4d9d7f2ef2e4d8c3af8c23a9b5",
  },
  {
    id: "solana",
    name: "Solana",
    color: "#14F195",
    keyService: "cresca_private_solana",
    addressService: "cresca_public_solana",
    fallbackAddress: "G2uV2jiN2QW5qYfULx9hDcZ1uHEKxv8x7tYqfQj8V3f5",
  },
  {
    id: "polygon",
    name: "Polygon",
    color: C.networks.polygon,
    keyService: "cresca_private_polygon",
    addressService: "cresca_public_polygon",
    fallbackAddress: "0x4f3f2cf3b18a0a347cb4f2f8f2ad4d8f2b8bd2f1",
  },
];

const FALLBACK_SEED_WORDS = Array.from({ length: 25 }, () => "••••");

async function getSecureValue(key: string): Promise<string> {
  try {
    const value = await SecureStore.getItemAsync(key);
    return value ?? "";
  } catch {
    return "";
  }
}

export default function PaymentsScreen() {
  const router = useRouter();

  const limitSheetRef = useRef<BottomSheetModal | null>(null);
  const seedPhraseSheetRef = useRef<BottomSheetModal | null>(null);
  const publicKeySheetRef = useRef<BottomSheetModal | null>(null);
  const chooseNetworkSheetRef = useRef<BottomSheetModal | null>(null);
  const sessionLockSheetRef = useRef<BottomSheetModal | null>(null);

  const clipboardClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mevProtectionEnabled, setMevProtectionEnabled] = useState(true);
  const [limitEnabled, setLimitEnabled] = useState(true);
  const [sessionLockValue, setSessionLockValue] = useState<(typeof SESSION_LOCK_OPTIONS)[number]>("5 mins");

  const [allowanceInput, setAllowanceInput] = useState("500");

  const [isSeedSheetOpen, setIsSeedSheetOpen] = useState(false);
  const [seedWords, setSeedWords] = useState<string[]>([]);
  const [seedLoading, setSeedLoading] = useState(false);

  const [isPublicSheetOpen, setIsPublicSheetOpen] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkOption>(NETWORK_OPTIONS[0]);
  const [networkSearch, setNetworkSearch] = useState("");
  const [networkAddress, setNetworkAddress] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [publicLoading, setPublicLoading] = useState(false);
  const [privateKeyVisible, setPrivateKeyVisible] = useState(false);

  const [sessionDraft, setSessionDraft] = useState<(typeof SESSION_LOCK_OPTIONS)[number]>("5 mins");

  useEffect(() => {
    return () => {
      if (clipboardClearTimerRef.current) {
        clearTimeout(clipboardClearTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isSeedSheetOpen) {
      return;
    }

    let cancelled = false;

    const openSeedSheet = async () => {
      setSeedLoading(true);

      try {
        try {
          await ScreenCapture.preventScreenCaptureAsync();
        } catch {
          // ScreenCapture native module may not be linked in dev builds; ignore.
        }

        let mnemonic = "";
        try {
          mnemonic = await algorandService.exportMnemonic();
        } catch {
          mnemonic = "";
        }

        if (cancelled) return;

        const words = mnemonic.trim().length > 0
          ? mnemonic.trim().split(/\s+/)
          : FALLBACK_SEED_WORDS;

        // Algorand mnemonics are 25 words. Pad/truncate to keep the grid stable.
        const target = words.length >= 25 ? 25 : 12;
        const padded =
          words.length < target
            ? [...words, ...Array.from({ length: target - words.length }, () => "••••")]
            : words.slice(0, target);

        setSeedWords(padded);
      } finally {
        if (!cancelled) {
          setSeedLoading(false);
        }
      }
    };

    void openSeedSheet();

    return () => {
      cancelled = true;
      setSeedWords([]);
      setSeedLoading(false);
      try {
        void ScreenCapture.allowScreenCaptureAsync();
      } catch {
        // ignore — native module may not be linked
      }
    };
  }, [isSeedSheetOpen]);

  useEffect(() => {
    if (!isPublicSheetOpen) {
      return;
    }

    let cancelled = false;

    const loadPublicAndPrivateValues = async () => {
      setPublicLoading(true);

      try {
        let pub = "";
        let priv = "";

        if (selectedNetwork.isAlgorand) {
          try {
            pub = algorandService.getAddress();
          } catch {
            pub = "";
          }
          try {
            priv = await algorandService.exportMnemonic();
          } catch {
            priv = "";
          }
        } else {
          [pub, priv] = await Promise.all([
            getSecureValue(selectedNetwork.addressService),
            getSecureValue(selectedNetwork.keyService),
          ]);
        }

        if (cancelled) return;

        setNetworkAddress(
          pub.trim().length > 0 ? pub : selectedNetwork.fallbackAddress,
        );
        setPrivateKey(priv);
      } finally {
        if (!cancelled) {
          setPublicLoading(false);
        }
      }
    };

    void loadPublicAndPrivateValues();

    return () => {
      cancelled = true;
      setPrivateKeyVisible(false);
      setNetworkAddress("");
      setPrivateKey("");
      setPublicLoading(false);
    };
  }, [isPublicSheetOpen, selectedNetwork]);

  const filteredNetworks = useMemo(() => {
    const search = networkSearch.trim().toLowerCase();
    if (!search) {
      return NETWORK_OPTIONS;
    }

    return NETWORK_OPTIONS.filter((network) => network.name.toLowerCase().includes(search));
  }, [networkSearch]);

  const onKeypadPress = (key: (typeof KEYPAD_KEYS)[number]) => {
    setAllowanceInput((prev) => {
      if (key === "⌫") {
        return prev.slice(0, -1);
      }

      if (key === ".") {
        if (prev.includes(".")) {
          return prev;
        }

        if (prev.length === 0) {
          return "0.";
        }

        return `${prev}.`;
      }

      if (prev.includes(".")) {
        const decimals = prev.split(".")[1] ?? "";
        if (decimals.length >= 2) {
          return prev;
        }
      }

      if (prev === "0") {
        return key;
      }

      return `${prev}${key}`;
    });
  };

  const openSeedPhraseSheet = () => {
    setIsSeedSheetOpen(true);
    seedPhraseSheetRef.current?.present();
  };

  const openChooseNetworkSheet = () => {
    chooseNetworkSheetRef.current?.present();
  };

  const openPublicSheetForNetwork = (network: NetworkOption) => {
    setSelectedNetwork(network);
    chooseNetworkSheetRef.current?.dismiss();

    setTimeout(() => {
      setIsPublicSheetOpen(true);
      publicKeySheetRef.current?.present();
    }, 180);
  };

  const copySecureValue = async (value: string) => {
    if (!value.trim()) {
      return;
    }

    Clipboard.setString(value);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (clipboardClearTimerRef.current) {
      clearTimeout(clipboardClearTimerRef.current);
    }

    clipboardClearTimerRef.current = setTimeout(() => {
      Clipboard.setString("");
    }, 30_000);
  };

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.back()}>
          <IconWrapper icon={ArrowLeft01Icon} size={20} color={C.text.t1} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Security</Text>

        <View style={styles.headerIconBtn}>
          <IconWrapper icon={LockKeyIcon} size={20} color={C.text.t1} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>Manage keys / Seed phrase</Text>

        <View style={styles.manageCard}>
          <TouchableOpacity style={styles.manageRow} onPress={openChooseNetworkSheet}>
            <Text style={styles.manageRowLabel}>Reveal Key</Text>
            <IconWrapper icon={ViewIcon} size={18} color={C.brand.teal} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.manageRow} onPress={openSeedPhraseSheet}>
            <Text style={styles.manageRowLabel}>Reveal Seed Phrase</Text>
            <IconWrapper icon={ViewIcon} size={18} color={C.brand.teal} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, styles.protectionLabel]}>Protection</Text>

        <TouchableOpacity
          style={styles.protectionRow}
          onPress={() => {
            Alert.alert(
              "Two-Factor Authentication",
              "2FA setup is coming soon. Until then, your transactions over the configured allowance will require app password re-entry.",
            );
          }}
        >
          <View style={styles.protectionTextWrap}>
            <Text style={styles.protectionTitle}>2 Factor Authentication</Text>
            <Text style={styles.protectionSubtitle}>Re-auth required above allowance limit</Text>
          </View>
          <IconWrapper icon={ArrowRight01Icon} size={16} color={C.text.t2} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.protectionRow}
          onPress={() => {
            setSessionDraft(sessionLockValue);
            sessionLockSheetRef.current?.present();
          }}
        >
          <Text style={styles.protectionTitle}>Session Lock</Text>
          <View style={styles.sessionValueWrap}>
            <Text style={styles.sessionValue}>{sessionLockValue}</Text>
            <IconWrapper icon={ArrowDown01Icon} size={14} color={C.text.t2} />
          </View>
        </TouchableOpacity>

        <View style={styles.protectionRow}>
          <Text style={styles.protectionTitle}>MEV Protection</Text>
          <Switch
            value={mevProtectionEnabled}
            onValueChange={setMevProtectionEnabled}
            trackColor={{ false: "#D1D5DB", true: C.brand.teal }}
          />
        </View>

        <View style={styles.protectionRow}>
          <Text style={styles.protectionTitle}>Set Limit for Transaction</Text>
          <Switch
            value={limitEnabled}
            onValueChange={setLimitEnabled}
            trackColor={{ false: "#D1D5DB", true: C.brand.teal }}
          />
        </View>

        {limitEnabled ? (
          <View>
            <Text style={[styles.sectionLabel, styles.allowanceLabel]}>Token Allowance</Text>
            <TouchableOpacity style={styles.allowanceRow} onPress={() => limitSheetRef.current?.present()}>
              <Text style={styles.allowanceValue}>$500.00</Text>
              <IconWrapper icon={MoreHorizontalIcon} size={18} color={C.text.t2} />
            </TouchableOpacity>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => {
            Alert.alert(
              "Log out",
              "You'll be returned to onboarding. Make sure you have your seed phrase backed up.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Log out",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      appPasswordService.lockSession();
                      await AsyncStorage.removeItem("cresca_onboarding_completed");
                      authEmitter.emit(false);
                      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      router.replace("/onboarding");
                    } catch (e) {
                      Alert.alert("Logout failed", "Please try again.");
                    }
                  },
                },
              ],
            );
          }}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          <IconWrapper icon={Logout01Icon} size={18} color={C.semantic.danger} />
          <Text style={styles.logoutBtnText}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>

      <CrescaSheet sheetRef={limitSheetRef} snapPoints={["70%"]} title="Set Limit">
        <View style={styles.sheetBody}>
          <Text style={styles.limitHint}>Once the limit reached 2FA will be enabled</Text>
          <Text style={styles.limitAmount}>$ {allowanceInput || "0"}</Text>

          <View style={styles.keypadGrid}>
            {KEYPAD_KEYS.map((key) => (
              <TouchableOpacity
                key={key}
                style={styles.keypadKey}
                onPress={() => onKeypadPress(key)}
              >
                <Text style={[styles.keypadKeyText, key === "⌫" && styles.keypadBackspace]}>{key}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <PrimaryButton
            label="Set Allowance Limit"
            onPress={() => {
              limitSheetRef.current?.dismiss();
            }}
          />
        </View>
      </CrescaSheet>

      <CrescaSheet
        sheetRef={seedPhraseSheetRef}
        snapPoints={["75%"]}
        title="Seed phrase"
        onClose={() => {
          setIsSeedSheetOpen(false);
        }}
      >
        <View style={styles.sheetBody}>
          <Text style={styles.seedWarning}>Do not share with anyone.</Text>

          <View style={styles.seedGridWrap}>
            {seedLoading ? (
              <View style={styles.seedLoadingWrap}>
                <ActivityIndicator size="small" color={C.brand.teal} />
                <Text style={styles.seedLoadingText}>Loading seed phrase...</Text>
              </View>
            ) : (
              <View style={styles.seedGrid}>
                {(seedWords.length > 0 ? seedWords : FALLBACK_SEED_WORDS).map((word, index) => (
                  <View key={`seed-${index + 1}`} style={styles.seedChip}>
                    <Text style={styles.seedChipText}>{index + 1}. {word}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <PrimaryButton
            label="Copy Private Key"
            onPress={() => void copySecureValue(seedWords.join(" "))}
          />
        </View>
      </CrescaSheet>

      <CrescaSheet
        sheetRef={publicKeySheetRef}
        snapPoints={["60%"]}
        title="Public Key"
        onClose={() => {
          setIsPublicSheetOpen(false);
        }}
      >
        <View style={styles.sheetBody}>
          <Text style={styles.publicSubtitle}>Use to receive cryptocurrency transactions</Text>

          {publicLoading ? (
            <View style={styles.publicLoadingWrap}>
              <ActivityIndicator size="small" color={C.brand.teal} />
            </View>
          ) : (
            <Text selectable style={styles.publicValue}>
              {privateKeyVisible
                ? privateKey || "No private key found in keychain"
                : networkAddress || selectedNetwork.fallbackAddress}
            </Text>
          )}

          <PrimaryButton
            label={privateKeyVisible ? "Hide Private Key" : "Reveal Private Key"}
            variant="outline"
            onPress={() => setPrivateKeyVisible((prev) => !prev)}
          />

          <TouchableOpacity
            style={styles.eyeInline}
            onPress={() => setPrivateKeyVisible((prev) => !prev)}
          >
            <IconWrapper icon={privateKeyVisible ? ViewOffIcon : ViewIcon} size={16} color={C.brand.teal} />
            <Text style={styles.eyeInlineText}>Toggle key visibility</Text>
          </TouchableOpacity>

          <PrimaryButton
            label="Copy Private Key"
            onPress={() => void copySecureValue(privateKey)}
          />
        </View>
      </CrescaSheet>

      <CrescaSheet sheetRef={chooseNetworkSheetRef} snapPoints={["75%"]} title="Choose Network">
        <View style={styles.sheetBody}>
          <Text style={styles.chooseSubtitle}>Choose specific network to reveal Private Key</Text>

          <CrescaInput
            value={networkSearch}
            onChangeText={setNetworkSearch}
            placeholder="Search network"
            containerStyle={styles.networkSearchInput}
          />

          <FlatList
            data={filteredNetworks}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <NetworkAddressRow
                networkName={item.name}
                address={item.fallbackAddress}
                networkColor={item.color}
                hideActions
                onPress={() => openPublicSheetForNetwork(item)}
              />
            )}
            style={styles.networkList}
          />

          <PrimaryButton
            label="Cancel"
            variant="outline"
            onPress={() => chooseNetworkSheetRef.current?.dismiss()}
          />
        </View>
      </CrescaSheet>

      <CrescaSheet sheetRef={sessionLockSheetRef} snapPoints={["50%"]} title="Session Lock">
        <View style={styles.sheetBody}>
          {SESSION_LOCK_OPTIONS.map((option) => {
            const selected = sessionDraft === option;
            return (
              <TouchableOpacity
                key={option}
                style={styles.radioRow}
                onPress={() => setSessionDraft(option)}
              >
                <Text style={styles.radioLabel}>{option}</Text>
                <View style={[styles.radioOuter, selected && styles.radioOuterActive]}>
                  {selected ? <View style={styles.radioInner} /> : null}
                </View>
              </TouchableOpacity>
            );
          })}

          <PrimaryButton
            label="Save"
            onPress={() => {
              setSessionLockValue(sessionDraft);
              sessionLockSheetRef.current?.dismiss();
            }}
          />
        </View>
      </CrescaSheet>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.surfaces.bgBase,
  },
  header: {
    height: 56,
    paddingHorizontal: H_PAD,
    borderBottomWidth: 1,
    borderBottomColor: C.borders.bDefault,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: R.full,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...T.h2,
    color: C.text.t1,
  },
  content: {
    paddingHorizontal: H_PAD,
    paddingTop: S.md,
    // Leave room for the floating tab bar (bottom:18 + height:~85 + breathing room)
    paddingBottom: 140,
  },
  sectionLabel: {
    ...T.smBold,
    color: C.text.t2,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: S.sm,
  },
  manageCard: {
    borderRadius: R.sm,
    overflow: "hidden",
    backgroundColor: C.surfaces.bgSurface,
  },
  manageRow: {
    height: 54,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: C.borders.bDefault,
  },
  manageRowLabel: {
    ...T.bodyMd,
    color: C.text.t1,
  },
  protectionLabel: {
    marginTop: S.lg,
  },
  protectionRow: {
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: C.borders.bDefault,
    backgroundColor: C.surfaces.bgBase,
  },
  protectionTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  protectionTitle: {
    ...T.bodyMd,
    color: C.text.t1,
  },
  protectionSubtitle: {
    ...T.sm,
    color: C.text.t2,
    marginTop: 2,
  },
  sessionValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  sessionValue: {
    ...T.sm,
    color: C.text.t2,
  },
  allowanceLabel: {
    marginTop: S.lg,
  },
  allowanceRow: {
    height: 54,
    borderRadius: R.sm,
    backgroundColor: C.surfaces.bgSurface,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  allowanceValue: {
    ...T.bodyMd,
    color: C.text.t1,
  },
  logoutBtn: {
    marginTop: S.xl,
    minHeight: 48,
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: C.semantic.danger,
    backgroundColor: "rgba(240,68,56,0.04)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  logoutBtnText: {
    ...T.btn,
    color: C.semantic.danger,
  },
  sheetBody: {
    flex: 1,
    gap: S.md,
  },
  limitHint: {
    ...T.sm,
    color: C.text.t2,
    textAlign: "center",
  },
  limitAmount: {
    ...T.display,
    color: C.text.t1,
    textAlign: "center",
  },
  keypadGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
  },
  keypadKey: {
    width: "31%",
    height: 56,
    borderRadius: R.sm,
    backgroundColor: C.surfaces.bgSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  keypadKeyText: {
    ...T.bodyMd,
    color: C.text.t1,
  },
  keypadBackspace: {
    color: C.text.t3,
  },
  seedWarning: {
    ...T.smBold,
    color: C.semantic.danger,
  },
  seedGridWrap: {
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.borders.bVerified,
    backgroundColor: "rgba(0,212,170,0.05)",
    padding: 10,
    minHeight: 188,
  },
  seedLoadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: S.xs,
  },
  seedLoadingText: {
    ...T.sm,
    color: C.text.t2,
  },
  seedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
  },
  seedChip: {
    width: "31%",
    borderRadius: R.sm,
    backgroundColor: C.surfaces.bgBase,
    borderWidth: 1,
    borderColor: C.borders.bVerified,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  seedChipText: {
    ...T.sm,
    color: C.text.t1,
  },
  publicSubtitle: {
    ...T.sm,
    color: C.text.t2,
  },
  publicLoadingWrap: {
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  publicValue: {
    ...T.address,
    color: C.text.t1,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    padding: 12,
    backgroundColor: C.surfaces.bgSurface,
  },
  eyeInline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: -6,
  },
  eyeInlineText: {
    ...T.sm,
    color: C.brand.teal,
  },
  chooseSubtitle: {
    ...T.sm,
    color: C.text.t2,
    marginBottom: -4,
  },
  networkSearchInput: {
    marginTop: 0,
  },
  networkList: {
    flex: 1,
    minHeight: 240,
  },
  radioRow: {
    height: 48,
    borderBottomWidth: 1,
    borderBottomColor: C.borders.bDefault,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  radioLabel: {
    ...T.body,
    color: C.text.t1,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: C.borders.bStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterActive: {
    borderColor: C.brand.black,
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: R.full,
    backgroundColor: C.brand.black,
  },
});
