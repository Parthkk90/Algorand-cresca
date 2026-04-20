import { Ionicons } from "@expo/vector-icons";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  ListRenderItem,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  default as Reanimated,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { LineChart } from "react-native-wagmi-charts";
import { ScreenContainer } from "../components/ScreenContainer";
import { TxSkeletonRow } from "../components/SkeletonRow";
import {
  AssetChip,
  CrescaInput,
  CrescaSheet,
  LiveBadge,
  PrimaryButton,
  StatCard,
} from "../src/components/ui";
import { C, H_PAD, R, S, T } from "../src/theme";
import {
  MarketSector,
  SortBy,
  useMarketsPreferencesStore,
} from "../src/stores/useMarketsPreferencesStore";

type Ecosystem = "Algorand" | "Ethereum" | "BSC" | "Polygon" | "Solana";

type MarketAsset = {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  ecosystem: Ecosystem;
  sectors: string[];
  verified: boolean;
};

type SortArrowProps = {
  active: boolean;
  rotationValue: { value: number };
};

const MARKETS_CACHE_KEY = "cresca_markets_cache_v2";
const RATE_LIMIT_COOLDOWN_MS = 2 * 60 * 1000;
let lastRateLimitAt = 0;

const SECTOR_FILTERS: MarketSector[] = [
  "All",
  "DeFi",
  "AI",
  "Stablecoin",
  "Algorand",
  "Layer1",
  "GameFi",
];

const ECOSYSTEMS: Ecosystem[] = [
  "Algorand",
  "Ethereum",
  "BSC",
  "Polygon",
  "Solana",
];

const SORT_OPTIONS: Array<{ key: SortBy; label: string }> = [
  { key: "marketCap", label: "Market Cap" },
  { key: "volume24h", label: "Volume 24h" },
  { key: "price", label: "Price" },
  { key: "change24h", label: "Gainers" },
  { key: "losers", label: "Losers" },
];

const MARKET_META: Record<
  string,
  { symbol: string; name: string; ecosystem: Ecosystem; sectors: string[] }
> = {
  algorand: { symbol: "ALGO", name: "Algorand", ecosystem: "Algorand", sectors: ["Layer1"] },
  ethereum: { symbol: "ETH", name: "Ethereum", ecosystem: "Ethereum", sectors: ["Layer1", "DeFi"] },
  bitcoin: { symbol: "BTC", name: "Bitcoin", ecosystem: "BSC", sectors: ["Layer1"] },
  solana: { symbol: "SOL", name: "Solana", ecosystem: "Solana", sectors: ["Layer1", "GameFi"] },
  "usd-coin": { symbol: "USDC", name: "USD Coin", ecosystem: "Ethereum", sectors: ["Stablecoin"] },
  tether: { symbol: "USDT", name: "Tether", ecosystem: "BSC", sectors: ["Stablecoin"] },
  "binancecoin": { symbol: "BNB", name: "BNB", ecosystem: "BSC", sectors: ["Layer1"] },
  "matic-network": { symbol: "MATIC", name: "Polygon", ecosystem: "Polygon", sectors: ["Layer1"] },
  chainlink: { symbol: "LINK", name: "Chainlink", ecosystem: "Ethereum", sectors: ["DeFi", "AI"] },
  arbitrum: { symbol: "ARB", name: "Arbitrum", ecosystem: "Ethereum", sectors: ["DeFi"] },
  optimism: { symbol: "OP", name: "Optimism", ecosystem: "Ethereum", sectors: ["DeFi"] },
  aave: { symbol: "AAVE", name: "Aave", ecosystem: "Ethereum", sectors: ["DeFi"] },
  uniswap: { symbol: "UNI", name: "Uniswap", ecosystem: "Ethereum", sectors: ["DeFi"] },
  aptos: { symbol: "APT", name: "Aptos", ecosystem: "Solana", sectors: ["Layer1", "GameFi"] },
  sui: { symbol: "SUI", name: "Sui", ecosystem: "Solana", sectors: ["Layer1", "GameFi"] },
};

const MARKET_IDS = Object.keys(MARKET_META);

const ID_TO_ASA: Record<string, number> = {
  algorand: 0,
  ethereum: 101,
  bitcoin: 100,
  solana: 102,
  "usd-coin": 10458941,
};

function formatPrice(value: number): string {
  if (value >= 1000) {
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }

  if (value >= 1) {
    return `$${value.toFixed(2)}`;
  }

  return `$${value.toFixed(4)}`;
}

function formatCompactUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function buildMiniSparkline(price: number, change24h: number): Array<{ timestamp: number; value: number }> {
  const points = 20;
  const now = Date.now();
  const out: Array<{ timestamp: number; value: number }> = [];
  let current = Math.max(0.000001, price * (1 - change24h / 100));

  for (let i = 0; i < points; i += 1) {
    const drift = (price - current) * 0.08;
    const noise = (Math.random() - 0.5) * Math.max(0.01, price * 0.015);
    current = Math.max(0.000001, current + drift + noise);
    out.push({
      timestamp: now - (points - i) * 60_000,
      value: current,
    });
  }

  if (out.length > 0) {
    out[out.length - 1] = { ...out[out.length - 1], value: Math.max(0.000001, price) };
  }

  return out;
}

async function fetchMarketsLive(): Promise<MarketAsset[]> {
  const now = Date.now();
  if (lastRateLimitAt > 0 && now - lastRateLimitAt < RATE_LIMIT_COOLDOWN_MS) {
    const cachedRaw = await AsyncStorage.getItem(MARKETS_CACHE_KEY);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw) as MarketAsset[];
      if (cached.length > 0) return cached;
    }
  }

  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${MARKET_IDS.join(",")}&price_change_percentage=24h`;
  const response = await fetch(url);

  if (response.status === 429) {
    lastRateLimitAt = now;
    const cachedRaw = await AsyncStorage.getItem(MARKETS_CACHE_KEY);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw) as MarketAsset[];
      if (cached.length > 0) return cached;
    }

    throw new Error("CoinGecko rate limited. Try again shortly.");
  }

  if (!response.ok) {
    throw new Error(`Market API ${response.status}`);
  }

  const payload = (await response.json()) as Array<Record<string, unknown>>;
  const parsed: MarketAsset[] = (Array.isArray(payload) ? payload : [])
    .map((item) => {
      const id = String(item.id ?? "");
      const meta = MARKET_META[id];
      if (!meta) return null;

      const price = Number(item.current_price ?? NaN);
      const change24h = Number(item.price_change_percentage_24h ?? 0);
      const marketCap = Number(item.market_cap ?? 0);
      const volume24h = Number(item.total_volume ?? 0);

      if (!Number.isFinite(price)) return null;

      return {
        id,
        symbol: meta.symbol,
        name: meta.name,
        price,
        change24h,
        marketCap,
        volume24h,
        ecosystem: meta.ecosystem,
        sectors: meta.sectors,
        verified: true,
      };
    })
    .filter((entry): entry is MarketAsset => entry !== null);

  await AsyncStorage.setItem(MARKETS_CACHE_KEY, JSON.stringify(parsed));
  return parsed;
}

function SortArrow({ active, rotationValue }: SortArrowProps) {
  const arrowStyle = useAnimatedStyle(() => {
    const degree = rotationValue.value * 180;
    return {
      transform: [{ rotate: `${degree}deg` }],
      opacity: active ? 1 : 0.45,
    };
  }, [active]);

  return (
    <Reanimated.View style={arrowStyle}>
      <Ionicons name="chevron-down" size={12} color={active ? C.brand.teal : C.text.t2} />
    </Reanimated.View>
  );
}

function MarketRow({
  asset,
  onPress,
}: {
  asset: MarketAsset;
  onPress: () => void;
}) {
  const positive = asset.change24h >= 0;

  return (
    <TouchableOpacity style={styles.marketRow} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.assetLeftWrap}>
        <View style={styles.assetIconCircle}>
          <Text style={styles.assetIconText}>{asset.symbol.slice(0, 1)}</Text>
        </View>

        <View style={styles.assetNameWrap}>
          <Text style={styles.assetName}>{asset.name}</Text>
          <Text style={styles.assetSymbol}>{asset.symbol}</Text>
        </View>
      </View>

      <View style={styles.assetRightWrap}>
        <Text style={styles.assetPrice}>{formatPrice(asset.price)}</Text>
        <Text style={[styles.assetChange, positive ? styles.positive : styles.negative]}>
          {positive ? "+" : ""}
          {asset.change24h.toFixed(2)}%
        </Text>
        <Text style={styles.assetCap}>{formatCompactUsd(asset.marketCap)}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function MarketsScreen() {
  const router = useRouter();

  const filterSheetRef = useRef<BottomSheetModal | null>(null);
  const quickViewSheetRef = useRef<BottomSheetModal | null>(null);

  const searchAnim = useRef(new Animated.Value(0)).current;
  const skeletonPulse = useRef(new Animated.Value(1)).current;
  const sortDirectionAnim = useSharedValue(0);

  const [searchVisible, setSearchVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedMarket, setSelectedMarket] = useState<MarketAsset | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>([]);

  const [appliedEcosystems, setAppliedEcosystems] = useState<Ecosystem[]>([]);
  const [showVerifiedOnly, setShowVerifiedOnly] = useState(false);
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);

  const [draftEcosystems, setDraftEcosystems] = useState<Ecosystem[]>([]);
  const [draftVerifiedOnly, setDraftVerifiedOnly] = useState(false);
  const [draftWatchlistOnly, setDraftWatchlistOnly] = useState(false);
  const [draftSortBy, setDraftSortBy] = useState<SortBy>("marketCap");

  const sector = useMarketsPreferencesStore((state) => state.sector);
  const sortBy = useMarketsPreferencesStore((state) => state.sortBy);
  const sortAscending = useMarketsPreferencesStore((state) => state.sortAscending);
  const setSector = useMarketsPreferencesStore((state) => state.setSector);
  const setSort = useMarketsPreferencesStore((state) => state.setSort);

  const marketsQuery = useQuery<MarketAsset[]>({
    queryKey: ["markets", "live"],
    queryFn: async () => {
      try {
        return await fetchMarketsLive();
      } catch {
        const cachedRaw = await AsyncStorage.getItem(MARKETS_CACHE_KEY);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw) as MarketAsset[];
          if (cached.length > 0) return cached;
        }
        throw new Error("Could not load markets. Tap to retry.");
      }
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const assets = marketsQuery.data ?? [];

  useEffect(() => {
    Animated.timing(searchAnim, {
      toValue: searchVisible ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [searchAnim, searchVisible]);

  useEffect(() => {
    sortDirectionAnim.value = withTiming(sortAscending ? 1 : 0, { duration: 180 });
  }, [sortAscending, sortDirectionAnim]);

  useEffect(() => {
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonPulse, {
          toValue: 0.55,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(skeletonPulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    pulseAnim.start();
    return () => pulseAnim.stop();
  }, [skeletonPulse]);

  const searchHeight = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 48],
  });

  const searchOpacity = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const filteredAndSorted = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = assets.filter((asset) => {
      if (q.length > 0) {
        const matchesSearch =
          asset.name.toLowerCase().includes(q) || asset.symbol.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      if (sector === "DeFi" && !asset.sectors.includes("DeFi")) return false;
      if (sector === "AI" && !asset.sectors.includes("AI")) return false;
      if (sector === "Stablecoin" && !asset.sectors.includes("Stablecoin")) return false;
      if (sector === "Algorand" && asset.ecosystem !== "Algorand") return false;
      if (sector === "Layer1" && !asset.sectors.includes("Layer1")) return false;
      if (sector === "GameFi" && !asset.sectors.includes("GameFi")) return false;

      if (appliedEcosystems.length > 0 && !appliedEcosystems.includes(asset.ecosystem)) {
        return false;
      }

      if (showVerifiedOnly && !asset.verified) return false;
      if (showWatchlistOnly && !watchlist.includes(asset.id)) return false;

      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      let result = 0;

      if (sortBy === "name") result = a.name.localeCompare(b.name);
      if (sortBy === "price") result = a.price - b.price;
      if (sortBy === "change24h") result = a.change24h - b.change24h;
      if (sortBy === "marketCap") result = a.marketCap - b.marketCap;
      if (sortBy === "volume24h") result = a.volume24h - b.volume24h;
      if (sortBy === "losers") result = a.change24h - b.change24h;

      if (sortBy === "losers") return result;
      return sortAscending ? result : -result;
    });

    return sorted;
  }, [
    appliedEcosystems,
    assets,
    query,
    sector,
    showVerifiedOnly,
    showWatchlistOnly,
    sortAscending,
    sortBy,
    watchlist,
  ]);

  const quickChart = useMemo(() => {
    if (!selectedMarket) return [];
    return buildMiniSparkline(selectedMarket.price, selectedMarket.change24h);
  }, [selectedMarket]);

  const quickChartWidth = useMemo(() => Math.max(160, Dimensions.get("window").width - 92), []);

  const toggleSort = (target: SortBy) => {
    if (sortBy === target) {
      setSort(target, !sortAscending);
      return;
    }

    setSort(target, target === "name");
  };

  const openFilterSheet = () => {
    setDraftEcosystems(appliedEcosystems);
    setDraftVerifiedOnly(showVerifiedOnly);
    setDraftWatchlistOnly(showWatchlistOnly);
    setDraftSortBy(sortBy);
    filterSheetRef.current?.present();
  };

  const applyFilters = () => {
    setAppliedEcosystems(draftEcosystems);
    setShowVerifiedOnly(draftVerifiedOnly);
    setShowWatchlistOnly(draftWatchlistOnly);
    const nextAscending = draftSortBy === "losers";
    setSort(draftSortBy, nextAscending);
    filterSheetRef.current?.dismiss();
  };

  const clearFilters = () => {
    setDraftEcosystems([]);
    setDraftVerifiedOnly(false);
    setDraftWatchlistOnly(false);
    setDraftSortBy("marketCap");
    setSort("marketCap", false);
  };

  const openQuickView = (asset: MarketAsset) => {
    setSelectedMarket(asset);
    quickViewSheetRef.current?.present();
  };

  const toggleWatchlist = (id: string) => {
    setWatchlist((prev) =>
      prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id],
    );
  };

  const renderItem: ListRenderItem<MarketAsset> = ({ item }) => {
    return <MarketRow asset={item} onPress={() => openQuickView(item)} />;
  };

  const listHeader = (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Markets</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => {
              setSearchVisible((prev) => !prev);
              void Haptics.selectionAsync();
            }}
            accessibilityRole="button"
            accessibilityLabel="Toggle search"
          >
            <Ionicons name="search" size={18} color={C.text.t1} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={openFilterSheet}
            accessibilityRole="button"
            accessibilityLabel="Open filters"
          >
            <Ionicons name="options-outline" size={18} color={C.text.t1} />
          </TouchableOpacity>
        </View>
      </View>

      <Animated.View style={[styles.searchAnimatedWrap, { height: searchHeight, opacity: searchOpacity }]}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={C.text.t2} />
          <CrescaInput
            containerStyle={styles.searchInputContainer}
            inputStyle={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            autoFocus={searchVisible}
            placeholder="Search assets..."
          />
          <TouchableOpacity
            onPress={() => {
              setQuery("");
              setSearchVisible(false);
            }}
          >
            <Ionicons name="close-circle" size={16} color={C.text.t2} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      <FlatList
        data={SECTOR_FILTERS}
        horizontal
        keyExtractor={(item) => item}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillsRow}
        renderItem={({ item }) => {
          const active = item === sector;
          return (
            <TouchableOpacity
              style={[styles.pill, active && styles.pillActive]}
              onPress={() => {
                setSector(item);
                void Haptics.selectionAsync();
              }}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>{item}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <View style={styles.sortRow}>
        <TouchableOpacity style={styles.sortCell} onPress={() => toggleSort("name")}>
          <Text style={[styles.sortText, sortBy === "name" && styles.sortTextActive]}>Name</Text>
          <SortArrow active={sortBy === "name"} rotationValue={sortDirectionAnim} />
          {sortBy === "name" ? <View style={styles.sortUnderline} /> : null}
        </TouchableOpacity>

        <TouchableOpacity style={styles.sortCell} onPress={() => toggleSort("price")}>
          <Text style={[styles.sortText, sortBy === "price" && styles.sortTextActive]}>Price</Text>
          <SortArrow active={sortBy === "price"} rotationValue={sortDirectionAnim} />
          {sortBy === "price" ? <View style={styles.sortUnderline} /> : null}
        </TouchableOpacity>

        <TouchableOpacity style={styles.sortCell} onPress={() => toggleSort("change24h")}>
          <Text style={[styles.sortText, sortBy === "change24h" && styles.sortTextActive]}>24h</Text>
          <SortArrow active={sortBy === "change24h"} rotationValue={sortDirectionAnim} />
          {sortBy === "change24h" ? <View style={styles.sortUnderline} /> : null}
        </TouchableOpacity>

        <TouchableOpacity style={styles.sortCell} onPress={() => toggleSort("marketCap")}>
          <Text style={[styles.sortText, sortBy === "marketCap" && styles.sortTextActive]}>MCap</Text>
          <SortArrow active={sortBy === "marketCap"} rotationValue={sortDirectionAnim} />
          {sortBy === "marketCap" ? <View style={styles.sortUnderline} /> : null}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ScreenContainer style={styles.container}>
      <FlatList
        data={filteredAndSorted}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            {marketsQuery.isLoading ? (
              <Animated.View style={[styles.skeletonWrap, { opacity: skeletonPulse }]}>
                {Array.from({ length: 8 }).map((_, idx) => (
                  <TxSkeletonRow key={`skeleton-${idx}`} />
                ))}
              </Animated.View>
            ) : marketsQuery.isError ? (
              <Pressable onPress={() => void marketsQuery.refetch()}>
                <Text style={styles.errorText}>Could not load markets. Tap to retry.</Text>
              </Pressable>
            ) : (
              <Text style={styles.emptyText}>No assets match current filters.</Text>
            )}
          </View>
        }
        ListFooterComponent={
          <View style={styles.footerWrap}>
            <Text style={styles.footerText}>Powered by Pyth Network · Algorand Indexer</Text>
            {marketsQuery.isFetching ? <LiveBadge /> : null}
          </View>
        }
      />

      <CrescaSheet sheetRef={filterSheetRef} snapPoints={["75%"]} title="Filter Assets">
        <View style={styles.sheetBody}>
          <Text style={styles.sheetLabel}>Ecosystem</Text>
          <View style={styles.ecosystemGrid}>
            {ECOSYSTEMS.map((ecosystem) => {
              const active = draftEcosystems.includes(ecosystem);
              return (
                <TouchableOpacity
                  key={ecosystem}
                  style={[styles.ecosystemChip, active && styles.ecosystemChipActive]}
                  onPress={() => {
                    setDraftEcosystems((prev) =>
                      prev.includes(ecosystem)
                        ? prev.filter((entry) => entry !== ecosystem)
                        : [...prev, ecosystem],
                    );
                  }}
                >
                  <AssetChip
                    symbol={ecosystem}
                    networkColor={active ? C.brand.teal : C.text.t2}
                    style={styles.assetChipInline}
                    textStyle={[styles.ecosystemChipText, active && styles.ecosystemChipTextActive]}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sheetLabel}>Sort by</Text>
          <View style={styles.radioList}>
            {SORT_OPTIONS.map((option) => {
              const selected = draftSortBy === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={styles.radioRow}
                  onPress={() => setDraftSortBy(option.key)}
                >
                  <Text style={styles.radioLabel}>{option.label}</Text>
                  <View style={[styles.radioOuter, selected && styles.radioOuterActive]}>
                    {selected ? <View style={styles.radioInner} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sheetLabel}>Show</Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Verified only</Text>
            <Switch
              value={draftVerifiedOnly}
              onValueChange={setDraftVerifiedOnly}
              trackColor={{ false: "#D1D5DB", true: "#00D4AA" }}
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Watchlist only</Text>
            <Switch
              value={draftWatchlistOnly}
              onValueChange={setDraftWatchlistOnly}
              trackColor={{ false: "#D1D5DB", true: "#00D4AA" }}
            />
          </View>

          <PrimaryButton label="Apply Filters" onPress={applyFilters} />
          <TouchableOpacity onPress={clearFilters}>
            <Text style={styles.clearText}>Clear All</Text>
          </TouchableOpacity>
        </View>
      </CrescaSheet>

      <CrescaSheet sheetRef={quickViewSheetRef} snapPoints={["60%"]} title="Asset Quick View">
        {selectedMarket ? (
          <View style={styles.quickSheetBody}>
            <View style={styles.quickHeaderRow}>
              <View style={styles.quickIconCircle}>
                <Text style={styles.quickIconText}>{selectedMarket.symbol.slice(0, 1)}</Text>
              </View>
              <View>
                <Text style={styles.quickTitle}>{selectedMarket.name}</Text>
                <Text style={styles.quickSymbol}>{selectedMarket.symbol}</Text>
              </View>
            </View>

            <Text style={styles.quickPrice}>{formatPrice(selectedMarket.price)}</Text>
            <Text style={[styles.quickChange, selectedMarket.change24h >= 0 ? styles.positive : styles.negative]}>
              {selectedMarket.change24h >= 0 ? "+" : ""}
              {selectedMarket.change24h.toFixed(2)}%
            </Text>

            <View style={styles.quickChartWrap}>
              <LineChart.Provider data={quickChart}>
                <LineChart width={quickChartWidth} height={60}>
                  <LineChart.Path color={selectedMarket.change24h >= 0 ? C.brand.black : C.semantic.danger} width={2} />
                </LineChart>
              </LineChart.Provider>
            </View>

            <View style={styles.quickStatsRow}>
              <StatCard label="Market Cap" value={formatCompactUsd(selectedMarket.marketCap)} style={styles.quickStat} />
              <StatCard label="Volume 24h" value={formatCompactUsd(selectedMarket.volume24h)} style={styles.quickStat} />
            </View>

            <TouchableOpacity
              style={[
                styles.watchlistBtn,
                watchlist.includes(selectedMarket.id) && styles.watchlistBtnActive,
              ]}
              onPress={() => toggleWatchlist(selectedMarket.id)}
            >
              <Text
                style={[
                  styles.watchlistBtnText,
                  watchlist.includes(selectedMarket.id) && styles.watchlistBtnTextActive,
                ]}
              >
                {watchlist.includes(selectedMarket.id)
                  ? "★ In Watchlist"
                  : "☆ Add to Watchlist"}
              </Text>
            </TouchableOpacity>

            <PrimaryButton
              label="View Full Details"
              variant="outline"
              onPress={() => {
                quickViewSheetRef.current?.dismiss();
                router.push({
                  pathname: "/assetDetail",
                  params: {
                    id: String(ID_TO_ASA[selectedMarket.id] ?? 0),
                    symbol: selectedMarket.symbol,
                    name: selectedMarket.name,
                    price: String(selectedMarket.price),
                  },
                });
              }}
            />

            <PrimaryButton
              label="Trade Now"
              onPress={() => {
                quickViewSheetRef.current?.dismiss();
                router.push({
                  pathname: "/swap",
                  params: {
                    from: selectedMarket.symbol,
                    to: "USDC",
                  },
                });
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
    backgroundColor: C.surfaces.bgBase,
  },
  listContent: {
    paddingBottom: S.xl,
  },
  headerRow: {
    paddingHorizontal: H_PAD,
    paddingTop: S.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    ...T.h1,
    color: C.text.t1,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: R.full,
    backgroundColor: C.surfaces.bgSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  searchAnimatedWrap: {
    overflow: "hidden",
    paddingHorizontal: H_PAD,
  },
  searchRow: {
    height: 48,
    borderRadius: R.md,
    backgroundColor: C.surfaces.bgSurface,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    marginTop: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  searchInputContainer: {
    flex: 1,
  },
  searchInput: {
    ...T.body,
    color: C.text.t1,
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  pillsRow: {
    paddingHorizontal: H_PAD,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  pill: {
    borderRadius: R.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: C.surfaces.bgSurface,
  },
  pillActive: {
    backgroundColor: C.brand.black,
  },
  pillText: {
    ...T.smBold,
    color: C.text.t1,
  },
  pillTextActive: {
    color: C.text.tInv,
  },
  sortRow: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.borders.bDefault,
    paddingVertical: 8,
    paddingHorizontal: H_PAD,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sortCell: {
    width: "24%",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingBottom: 2,
  },
  sortText: {
    ...T.sm,
    color: C.text.t2,
  },
  sortTextActive: {
    color: C.text.t1,
    fontFamily: "DMSans_700Bold",
  },
  sortUnderline: {
    marginTop: 2,
    height: 2,
    width: "70%",
    backgroundColor: C.brand.teal,
    borderRadius: R.full,
  },
  marketRow: {
    height: 64,
    borderBottomWidth: 1,
    borderBottomColor: C.borders.bDefault,
    paddingHorizontal: H_PAD,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  assetLeftWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  assetIconCircle: {
    width: 36,
    height: 36,
    borderRadius: R.full,
    backgroundColor: C.surfaces.bgSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  assetIconText: {
    ...T.bodyMd,
    color: C.text.t1,
  },
  assetNameWrap: {
    gap: 1,
  },
  assetName: {
    ...T.bodyMd,
    color: C.text.t1,
  },
  assetSymbol: {
    ...T.sm,
    color: C.text.t2,
  },
  assetRightWrap: {
    alignItems: "flex-end",
  },
  assetPrice: {
    ...T.bodyMd,
    color: C.text.t1,
  },
  assetChange: {
    ...T.smBold,
  },
  assetCap: {
    ...T.sm,
    color: C.text.t2,
  },
  positive: {
    color: C.semantic.success,
  },
  negative: {
    color: C.semantic.danger,
  },
  emptyWrap: {
    paddingHorizontal: H_PAD,
    paddingVertical: 16,
  },
  skeletonWrap: {
    gap: 2,
  },
  errorText: {
    ...T.body,
    color: C.text.t2,
    textAlign: "center",
    paddingVertical: 20,
  },
  emptyText: {
    ...T.body,
    color: C.text.t2,
    textAlign: "center",
    paddingVertical: 20,
  },
  footerWrap: {
    alignItems: "center",
    padding: 24,
    gap: 6,
  },
  footerText: {
    ...T.sm,
    color: C.text.t2,
    textAlign: "center",
  },
  sheetBody: {
    gap: 12,
  },
  sheetLabel: {
    ...T.smBold,
    color: C.text.t2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  ecosystemGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  ecosystemChip: {
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    backgroundColor: C.surfaces.bgBase,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  ecosystemChipActive: {
    borderColor: C.brand.teal,
  },
  assetChipInline: {
    backgroundColor: "transparent",
  },
  ecosystemChipText: {
    color: C.text.t2,
  },
  ecosystemChipTextActive: {
    color: C.brand.teal,
  },
  radioList: {
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
  },
  radioRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.borders.bDefault,
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
    borderColor: C.brand.teal,
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: R.full,
    backgroundColor: C.brand.teal,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  switchLabel: {
    ...T.body,
    color: C.text.t1,
  },
  clearText: {
    ...T.bodyMd,
    color: C.brand.teal,
    textAlign: "center",
    marginTop: 2,
  },
  quickSheetBody: {
    gap: 10,
  },
  quickHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  quickIconCircle: {
    width: 48,
    height: 48,
    borderRadius: R.full,
    backgroundColor: C.surfaces.bgSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  quickIconText: {
    ...T.h2,
    color: C.text.t1,
  },
  quickTitle: {
    ...T.h2,
    color: C.text.t1,
  },
  quickSymbol: {
    ...T.sm,
    color: C.text.t2,
  },
  quickPrice: {
    ...T.display,
    color: C.text.t1,
  },
  quickChange: {
    ...T.bodyMd,
    marginTop: -6,
  },
  quickChartWrap: {
    borderRadius: R.md,
    backgroundColor: C.surfaces.bgSurface,
    paddingVertical: 8,
    paddingHorizontal: 8,
    overflow: "hidden",
  },
  quickStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  quickStat: {
    flex: 1,
  },
  watchlistBtn: {
    height: 42,
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: C.brand.teal,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaces.bgBase,
  },
  watchlistBtnActive: {
    backgroundColor: "rgba(0,212,170,0.12)",
  },
  watchlistBtnText: {
    ...T.bodyMd,
    color: C.brand.teal,
  },
  watchlistBtnTextActive: {
    color: C.brand.teal,
    fontFamily: "DMSans_700Bold",
  },
});
