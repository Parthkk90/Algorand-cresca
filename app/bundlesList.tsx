import { Ionicons } from "@expo/vector-icons";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { ScreenContainer } from "../components/ScreenContainer";
import { BASKETS, Basket } from "../constants/baskets";
import {
  AssetChip,
  CrescaInput,
  CrescaSheet,
  PrimaryButton,
  StatusTag,
  StatusTagVariant,
} from "../src/components/ui";
import { C, H_PAD, R, S, T } from "../src/theme";

type Sector = "All" | "DeFi" | "AI" | "Stable" | "Leveraged" | "Algorand";
type RiskLevel = "Low" | "Medium" | "High";
type SortOption = "value" | "gain" | "assets" | "risk";

type BundleCardModel = {
  bundle: Basket;
  sector: Exclude<Sector, "All">;
  risk: RiskLevel;
  leverage: string;
  totalValue: number;
  gain24h: number;
};

const SECTORS: Sector[] = ["All", "DeFi", "AI", "Stable", "Leveraged", "Algorand"];

const SORT_OPTIONS: Array<{ key: SortOption; label: string }> = [
  { key: "value", label: "By Value" },
  { key: "gain", label: "By 24h Gain" },
  { key: "assets", label: "By # Assets" },
  { key: "risk", label: "By Risk Level" },
];

const RISK_ORDER: Record<RiskLevel, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
};

const BUNDLE_META: Record<
  string,
  {
    sector: Exclude<Sector, "All">;
    risk: RiskLevel;
    leverage: string;
    totalValue: number;
    gain24h: number;
  }
> = {
  "non-evm-giants": {
    sector: "Algorand",
    risk: "Medium",
    leverage: "12x",
    totalValue: 420,
    gain24h: 12.4,
  },
  "crypto-blue-chips": {
    sector: "DeFi",
    risk: "Low",
    leverage: "8x",
    totalValue: 614,
    gain24h: 8.2,
  },
  "move-ecosystem": {
    sector: "AI",
    risk: "High",
    leverage: "20x",
    totalValue: 501,
    gain24h: -3.1,
  },
  "speed-l1s": {
    sector: "Leveraged",
    risk: "High",
    leverage: "24x",
    totalValue: 783,
    gain24h: 16.8,
  },
  "store-of-value": {
    sector: "Stable",
    risk: "Low",
    leverage: "6x",
    totalValue: 358,
    gain24h: 4.5,
  },
};

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function networkColor(symbol: string): string {
  switch (symbol.toUpperCase()) {
    case "BTC":
      return C.networks.bitcoin;
    case "ETH":
      return C.networks.ethereum;
    case "ALGO":
      return C.networks.algorand;
    case "SOL":
    case "AVAX":
    case "APT":
    case "SUI":
    case "MOVE":
    case "XRP":
    case "ADA":
    case "NEAR":
      return C.brand.purple;
    default:
      return C.brand.teal;
  }
}

function riskTagVariant(risk: RiskLevel): StatusTagVariant {
  switch (risk) {
    case "High":
      return "danger";
    case "Medium":
      return "warning";
    case "Low":
      return "success";
    default:
      return "info";
  }
}

function serializeAssets(bundle: Basket): string {
  return JSON.stringify(bundle.assets);
}

export default function BundlesListScreen() {
  const router = useRouter();
  const sortSheetRef = useRef<BottomSheetModal | null>(null);
  const quickViewSheetRef = useRef<BottomSheetModal | null>(null);

  const [selectedSector, setSelectedSector] = useState<Sector>("All");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedSort, setAppliedSort] = useState<SortOption>("value");
  const [sortDraft, setSortDraft] = useState<SortOption>("value");
  const [selectedBundle, setSelectedBundle] = useState<BundleCardModel | null>(null);

  const searchAnim = useSharedValue(0);

  const searchAnimatedStyle = useAnimatedStyle(() => ({
    opacity: searchAnim.value,
    height: interpolate(searchAnim.value, [0, 1], [0, 62]),
    transform: [{ translateX: interpolate(searchAnim.value, [0, 1], [24, 0]) }],
    marginTop: interpolate(searchAnim.value, [0, 1], [0, S.sm]),
  }));

  const bundles = useMemo<BundleCardModel[]>(() => {
    const full = BASKETS.map((bundle) => {
      const meta = BUNDLE_META[bundle.id] ?? {
        sector: "DeFi" as const,
        risk: "Medium" as const,
        leverage: "10x",
        totalValue: 500,
        gain24h: 0,
      };

      return {
        bundle,
        sector: meta.sector,
        risk: meta.risk,
        leverage: meta.leverage,
        totalValue: meta.totalValue,
        gain24h: meta.gain24h,
      };
    });

    const normalizedQuery = searchQuery.trim().toLowerCase();

    const filtered = full.filter((entry) => {
      const sectorPass = selectedSector === "All" || entry.sector === selectedSector;
      if (!sectorPass) return false;

      if (!normalizedQuery) return true;

      const byName = entry.bundle.name.toLowerCase().includes(normalizedQuery);
      const byDesc = entry.bundle.description.toLowerCase().includes(normalizedQuery);
      const byAssets = entry.bundle.assets.some((asset) =>
        asset.symbol.toLowerCase().includes(normalizedQuery),
      );

      return byName || byDesc || byAssets;
    });

    return filtered.sort((a, b) => {
      if (appliedSort === "value") return b.totalValue - a.totalValue;
      if (appliedSort === "gain") return b.gain24h - a.gain24h;
      if (appliedSort === "assets") return b.bundle.assets.length - a.bundle.assets.length;
      return RISK_ORDER[a.risk] - RISK_ORDER[b.risk];
    });
  }, [appliedSort, searchQuery, selectedSector]);

  const sortLabel = useMemo(
    () => SORT_OPTIONS.find((option) => option.key === appliedSort)?.label ?? "By Value",
    [appliedSort],
  );

  const toggleSearch = () => {
    const next = !searchOpen;
    setSearchOpen(next);
    if (!next) setSearchQuery("");
    searchAnim.value = withTiming(next ? 1 : 0, { duration: 220 });
  };

  const openQuickView = (bundle: BundleCardModel) => {
    setSelectedBundle(bundle);
    quickViewSheetRef.current?.present();
  };

  const openTrade = (entry: BundleCardModel) => {
    router.push({
      pathname: "/bundleTrade",
      params: {
        bundleId: entry.bundle.id,
        bundleName: entry.bundle.name,
        assets: serializeAssets(entry.bundle),
        totalValue: String(entry.totalValue),
      },
    });
  };

  const applySort = () => {
    setAppliedSort(sortDraft);
    sortSheetRef.current?.dismiss();
  };

  const renderSectorPill = ({ item }: { item: Sector }) => {
    const isActive = item === selectedSector;
    return (
      <TouchableOpacity
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel={`Filter bundles by ${item}`}
        onPress={() => setSelectedSector(item)}
        style={[styles.sectorPill, isActive ? styles.sectorPillActive : styles.sectorPillInactive]}
      >
        <Text style={[styles.sectorLabel, isActive ? styles.sectorLabelActive : styles.sectorLabelInactive]}>
          {item}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderBundleCard = ({ item }: { item: BundleCardModel }) => {
    const visibleAssets = item.bundle.assets.slice(0, 3);
    const extraAssets = item.bundle.assets.length - visibleAssets.length;
    const gainPositive = item.gain24h >= 0;

    return (
      <View style={styles.card}>
        <View style={styles.cardTopRow}>
          <View style={styles.iconCircle}>
            <Ionicons name="layers-outline" size={18} color={C.brand.black} />
          </View>

          <View style={styles.cardTitleWrap}>
            <Text style={styles.cardTitle}>{item.bundle.name}</Text>
            <Text style={styles.cardSubtitle}>
              {item.sector} · {item.leverage}
            </Text>
          </View>
        </View>

        <View style={styles.chipsRow}>
          {visibleAssets.map((asset) => (
            <AssetChip
              key={`${item.bundle.id}-${asset.symbol}`}
              symbol={asset.symbol}
              networkColor={networkColor(asset.symbol)}
            />
          ))}

          {extraAssets > 0 ? (
            <View style={styles.moreChip}>
              <Text style={styles.moreChipText}>+{extraAssets} more</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.divider} />

        <View style={styles.valueRow}>
          <Text style={styles.valueText}>{formatUsd(item.totalValue)}</Text>
          <Text style={[styles.gainText, gainPositive ? styles.gainUp : styles.gainDown]}>
            {gainPositive ? "▲" : "▼"} {Math.abs(item.gain24h).toFixed(1)}%
          </Text>
        </View>

        <View style={styles.tagsRow}>
          <StatusTag label={`Risk: ${item.risk}`} variant={riskTagVariant(item.risk)} />
          <StatusTag label={item.sector} variant="purple" />
        </View>

        <View style={styles.actionsRow}>
          <View style={styles.actionButtonWrap}>
            <PrimaryButton
              label="View"
              variant="outline"
              style={styles.actionButton}
              onPress={() => openQuickView(item)}
            />
          </View>

          <View style={styles.actionButtonWrap}>
            <PrimaryButton label="Trade" variant="black" style={styles.actionButton} onPress={() => openTrade(item)} />
          </View>
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer style={styles.container}>
      <FlatList
        data={bundles}
        renderItem={renderBundleCard}
        keyExtractor={(item) => item.bundle.id}
        getItemLayout={(_, index) => ({ length: 64, offset: 64 * index, index })}
        ListHeaderComponent={
          <>
            <View style={styles.headerRow}>
              <Text style={styles.headerTitle}>Bundles</Text>
              <TouchableOpacity
                style={styles.searchIconBtn}
                accessibilityRole="button"
                accessibilityLabel="Open bundle search"
                onPress={toggleSearch}
              >
                <Ionicons name="search" size={20} color={C.brand.black} />
              </TouchableOpacity>
            </View>

            <Animated.View style={[styles.searchBarWrap, searchAnimatedStyle]}>
              <View style={styles.searchInputRow}>
                <CrescaInput
                  placeholder="Search bundles or assets"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  containerStyle={styles.searchInputContainer}
                />
                <TouchableOpacity
                  style={styles.closeSearchBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close bundle search"
                  onPress={toggleSearch}
                >
                  <Ionicons name="close" size={20} color={C.text.t2} />
                </TouchableOpacity>
              </View>
            </Animated.View>

            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={SECTORS}
              renderItem={renderSectorPill}
              keyExtractor={(item) => item}
              contentContainerStyle={styles.sectorsList}
            />

            <View style={styles.sortRow}>
              <Text style={styles.countText}>{bundles.length} bundles</Text>
              <TouchableOpacity
                style={styles.sortPill}
                accessibilityRole="button"
                accessibilityLabel="Open sort options"
                onPress={() => {
                  setSortDraft(appliedSort);
                  sortSheetRef.current?.present();
                }}
              >
                <Ionicons name="funnel-outline" size={14} color={C.text.t1} />
                <Text style={styles.sortPillText}>Sort</Text>
              </TouchableOpacity>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>No bundles in this sector</Text>
            <Text style={styles.emptyBody}>Try another filter</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <CrescaSheet sheetRef={sortSheetRef} snapPoints={["55%"]} title="Sort Bundles">
        <View style={styles.sortOptionsWrap}>
          {SORT_OPTIONS.map((option) => {
            const selected = sortDraft === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={styles.sortOptionRow}
                accessibilityRole="button"
                accessibilityLabel={`Sort ${option.label}`}
                onPress={() => setSortDraft(option.key)}
              >
                <Ionicons
                  name={selected ? "radio-button-on" : "radio-button-off"}
                  size={18}
                  color={selected ? C.brand.black : C.text.t2}
                />
                <Text style={styles.sortOptionText}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}

          <PrimaryButton label="Apply" variant="black" style={styles.sortApplyBtn} onPress={applySort} />
        </View>
      </CrescaSheet>

      <CrescaSheet sheetRef={quickViewSheetRef} snapPoints={["75%"]} title="Bundle Quick View">
        {selectedBundle ? (
          <View style={styles.quickViewWrap}>
            <View style={styles.quickHeadRow}>
              <Text style={styles.quickBundleName}>{selectedBundle.bundle.name}</Text>
              <StatusTag label={selectedBundle.sector} variant="purple" />
            </View>

            <View style={styles.quickChipsRow}>
              {selectedBundle.bundle.assets.map((asset) => (
                <AssetChip
                  key={`quick-${selectedBundle.bundle.id}-${asset.symbol}`}
                  symbol={asset.symbol}
                  networkColor={networkColor(asset.symbol)}
                />
              ))}
            </View>

            <View style={styles.quickValueRow}>
              <Text style={styles.quickValueText}>{formatUsd(selectedBundle.totalValue)}</Text>
              <Text
                style={[
                  styles.quickGainText,
                  selectedBundle.gain24h >= 0 ? styles.gainUp : styles.gainDown,
                ]}
              >
                {selectedBundle.gain24h >= 0 ? "▲" : "▼"} {Math.abs(selectedBundle.gain24h).toFixed(1)}%
              </Text>
            </View>

            <View style={styles.quickTagsRow}>
              <StatusTag
                label={`Risk: ${selectedBundle.risk}`}
                variant={riskTagVariant(selectedBundle.risk)}
              />
              <StatusTag label={`Leverage: ${selectedBundle.leverage}`} variant="warning" />
            </View>

            <View style={styles.allocationWrap}>
              <View style={styles.allocationBar}>
                {selectedBundle.bundle.assets.map((asset) => (
                  <View
                    key={`seg-${selectedBundle.bundle.id}-${asset.symbol}`}
                    style={[
                      styles.allocationSegment,
                      {
                        width: `${asset.weight}%`,
                        backgroundColor: networkColor(asset.symbol),
                      },
                    ]}
                  />
                ))}
              </View>

              {selectedBundle.bundle.assets.map((asset) => (
                <View key={`alloc-${selectedBundle.bundle.id}-${asset.symbol}`} style={styles.allocRow}>
                  <Text style={styles.allocLabel}>{asset.symbol}</Text>
                  <Text style={styles.allocValue}>{asset.weight}%</Text>
                </View>
              ))}
            </View>

            <PrimaryButton
              label="Trade This Bundle"
              variant="black"
              style={styles.quickTradeBtn}
              onPress={() => {
                quickViewSheetRef.current?.dismiss();
                openTrade(selectedBundle);
              }}
            />
          </View>
        ) : null}
      </CrescaSheet>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.surfaces.bgBase,
  },
  listContent: {
    paddingBottom: S.xl,
    flexGrow: 1,
  },
  headerRow: {
    paddingHorizontal: H_PAD,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  headerTitle: {
    ...T.h1,
    color: C.text.t1,
  },
  searchIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaces.bgBase,
  },
  searchBarWrap: {
    overflow: "hidden",
    paddingHorizontal: H_PAD,
  },
  searchInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInputContainer: {
    flex: 1,
  },
  closeSearchBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  sectorsList: {
    paddingHorizontal: H_PAD,
    gap: 8,
    marginTop: S.md,
    marginBottom: S.md,
  },
  sectorPill: {
    borderRadius: R.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sectorPillActive: {
    backgroundColor: C.brand.black,
  },
  sectorPillInactive: {
    backgroundColor: C.surfaces.bgSurface,
  },
  sectorLabel: {
    ...T.bodyMd,
  },
  sectorLabelActive: {
    color: C.text.tInv,
  },
  sectorLabelInactive: {
    color: C.text.t2,
  },
  sortRow: {
    paddingHorizontal: H_PAD,
    marginBottom: S.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  countText: {
    ...T.sm,
    color: C.text.t2,
  },
  sortPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    borderRadius: R.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: C.surfaces.bgBase,
  },
  sortPillText: {
    ...T.smBold,
    color: C.text.t1,
  },
  card: {
    marginHorizontal: H_PAD,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    borderRadius: R.lg,
    backgroundColor: C.surfaces.bgBase,
    padding: S.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaces.bgSurface,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
  },
  cardTitleWrap: {
    flex: 1,
  },
  cardTitle: {
    ...T.h3,
    color: C.text.t1,
  },
  cardSubtitle: {
    ...T.sm,
    color: C.text.t2,
    marginTop: 2,
  },
  chipsRow: {
    marginTop: S.md,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  moreChip: {
    backgroundColor: C.surfaces.bgSurface,
    borderRadius: R.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  moreChipText: {
    ...T.smBold,
    color: C.text.t2,
  },
  divider: {
    marginTop: S.md,
    borderTopWidth: 1,
    borderTopColor: C.borders.bDefault,
  },
  valueRow: {
    marginTop: S.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  valueText: {
    ...T.h3,
    color: C.text.t1,
  },
  gainText: {
    ...T.smBold,
  },
  gainUp: {
    color: C.semantic.success,
  },
  gainDown: {
    color: C.semantic.danger,
  },
  tagsRow: {
    marginTop: S.sm,
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  actionsRow: {
    marginTop: S.md,
    flexDirection: "row",
    gap: 10,
  },
  actionButtonWrap: {
    flex: 1,
  },
  actionButton: {
    width: "100%",
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: H_PAD,
    marginTop: 40,
  },
  emptyIcon: {
    fontSize: 30,
  },
  emptyTitle: {
    ...T.h2,
    color: C.text.t1,
    marginTop: S.sm,
  },
  emptyBody: {
    ...T.body,
    color: C.text.t2,
    marginTop: 4,
  },
  sortOptionsWrap: {
    gap: 12,
    paddingTop: 8,
  },
  sortOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  sortOptionText: {
    ...T.bodyMd,
    color: C.text.t1,
  },
  sortApplyBtn: {
    marginTop: 8,
  },
  quickViewWrap: {
    gap: 12,
    paddingTop: 4,
  },
  quickHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  quickBundleName: {
    ...T.h2,
    color: C.text.t1,
    flex: 1,
  },
  quickChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quickValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  quickValueText: {
    ...T.h2,
    color: C.text.t1,
  },
  quickGainText: {
    ...T.bodyMd,
  },
  quickTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  allocationWrap: {
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    borderRadius: R.md,
    padding: 12,
    gap: 8,
    backgroundColor: C.surfaces.bgSurface,
  },
  allocationBar: {
    height: 10,
    borderRadius: R.full,
    overflow: "hidden",
    flexDirection: "row",
    backgroundColor: C.surfaces.bgSunken,
  },
  allocationSegment: {
    height: 10,
  },
  allocRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  allocLabel: {
    ...T.sm,
    color: C.text.t2,
  },
  allocValue: {
    ...T.smBold,
    color: C.text.t1,
  },
  quickTradeBtn: {
    marginTop: 8,
  },
});