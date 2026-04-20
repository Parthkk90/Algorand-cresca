import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  ListRenderItem,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LineChart } from "react-native-wagmi-charts";
import { ScreenContainer } from "../components/ScreenContainer";
import { ASA_ID_TO_PYTH_SYMBOL, SYNTHETIC_ASA_IDS } from "../constants/baskets";
import { algorandService, AlgorandTransaction } from "../services/algorandService";
import { positionStore, StoredPosition } from "../services/positionStore";
import { pythOracleService } from "../services/pythOracleService";
import { SegmentTabs, StatCard, StatusTag } from "../src/components/ui";
import { C, H_PAD, R, S, T } from "../src/theme";

type Timeframe = "1H" | "1D" | "1W" | "1M" | "1Y";
type NetworkFilter = "all" | "ethereum" | "dai" | "solana";
type TxKind = "swap" | "send" | "receive" | "deploy" | "stake";
type HistoryGroup = "PENDING" | "TODAY" | "YESTERDAY";

type ChartPoint = {
  timestamp: number;
  value: number;
};

type AssetSnapshot = {
  walletAddress: string;
  balanceAlgo: number;
  transactions: AlgorandTransaction[];
  positions: StoredPosition[];
};

type PriceSnapshot = {
  livePrice: number;
  points: ChartPoint[];
  changePct: number;
  changeAmount: number;
};

type NetworkOption = {
  key: NetworkFilter;
  label: string;
  color: string;
};

type TxRowModel = {
  id: string;
  group: HistoryGroup;
  kind: TxKind;
  amountAlgo: number;
  timestampSec: number;
  description: string;
  hash: string;
  rawType: "sent" | "received";
};

type HistoryListItem =
  | { key: string; type: "header"; title: HistoryGroup }
  | { key: string; type: "tx"; row: TxRowModel };

type OpenPositionCard = {
  id: number;
  protocol: string;
  pair: string;
  usdValue: number;
};

const NETWORKS: NetworkOption[] = [
  { key: "all", label: "All", color: C.brand.black },
  { key: "ethereum", label: "Ethereum", color: C.networks.ethereum },
  { key: "dai", label: "Dai", color: "#F5AC37" },
  { key: "solana", label: "Solana", color: "#14F195" },
];

const TIMEFRAMES: Timeframe[] = ["1H", "1D", "1W", "1M", "1Y"];
const HISTORY_GROUP_ORDER: HistoryGroup[] = ["PENDING", "TODAY", "YESTERDAY"];

const SYMBOL_META: Record<
  string,
  { name: string; llamaKey?: string; defaultPair: string; buyLabel: string }
> = {
  ALGO: {
    name: "Algorand",
    llamaKey: "coingecko:algorand",
    defaultPair: "ALGO/USDC",
    buyLabel: "Buy ALGO",
  },
  ETH: {
    name: "Ethereum",
    llamaKey: "coingecko:ethereum",
    defaultPair: "ETH/USDC",
    buyLabel: "Buy ETH",
  },
  BTC: {
    name: "Bitcoin",
    llamaKey: "coingecko:bitcoin",
    defaultPair: "BTC/USDC",
    buyLabel: "Buy BTC",
  },
  SOL: {
    name: "Solana",
    llamaKey: "coingecko:solana",
    defaultPair: "SOL/USDC",
    buyLabel: "Buy SOL",
  },
  USDC: {
    name: "USD Coin",
    llamaKey: "coingecko:usd-coin",
    defaultPair: "USDC/ALGO",
    buyLabel: "Buy USDC",
  },
  DAI: {
    name: "Dai",
    llamaKey: "coingecko:dai",
    defaultPair: "DAI/USDC",
    buyLabel: "Buy DAI",
  },
};

function formatUsd(value: number, maxDigits = 2): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDigits,
  })}`;
}

function formatAlgo(value: number): string {
  return `${value.toFixed(4)} ALGO`;
}

function formatTimeLabel(timestampSec: number): string {
  const date = new Date(timestampSec * 1000);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateHash(hash: string): string {
  if (!hash) return "-";
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function resolveTimeframeSpec(timeframe: Timeframe): {
  span: string;
  period: string;
  points: number;
} {
  if (timeframe === "1H") return { span: "1h", period: "5m", points: 24 };
  if (timeframe === "1D") return { span: "1d", period: "1h", points: 24 };
  if (timeframe === "1W") return { span: "7d", period: "4h", points: 42 };
  if (timeframe === "1M") return { span: "30d", period: "1d", points: 30 };
  return { span: "365d", period: "1w", points: 52 };
}

function buildSyntheticSeries(basePrice: number, timeframe: Timeframe): ChartPoint[] {
  const { points } = resolveTimeframeSpec(timeframe);
  const now = Date.now();
  const spacingMs = Math.max(1, Math.floor((points <= 1 ? 1 : 1 / points) * 86_400_000));
  const out: ChartPoint[] = [];
  let value = Math.max(0.000001, basePrice * 0.88);

  for (let i = 0; i < points; i += 1) {
    const drift = (basePrice - value) * 0.04;
    const noise = (Math.random() - 0.5) * Math.max(0.5, basePrice) * 0.018;
    value = Math.max(0.000001, value + drift + noise);
    out.push({
      timestamp: now - (points - i) * spacingMs,
      value,
    });
  }

  if (out.length > 0) {
    out[out.length - 1] = {
      ...out[out.length - 1],
      value: Math.max(0.000001, basePrice),
    };
  }

  return out;
}

async function fetchDefiLlamaSeries(symbol: string, timeframe: Timeframe, fallbackPrice: number): Promise<ChartPoint[]> {
  const meta = SYMBOL_META[symbol];
  if (!meta?.llamaKey) {
    return buildSyntheticSeries(fallbackPrice, timeframe);
  }

  const { span, period } = resolveTimeframeSpec(timeframe);
  const url = `https://coins.llama.fi/chart/${encodeURIComponent(meta.llamaKey)}?span=${span}&period=${period}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`DeFiLlama chart ${response.status}`);
    }

    const payload = (await response.json()) as {
      coins?: Record<string, { prices?: Array<{ timestamp?: number; price?: number }> }>;
    };

    const entries = payload?.coins?.[meta.llamaKey]?.prices ?? [];
    const parsed = entries
      .map((entry) => ({
        timestamp: Number(entry.timestamp ?? 0),
        value: Number(entry.price ?? NaN),
      }))
      .filter((entry) => Number.isFinite(entry.timestamp) && Number.isFinite(entry.value) && entry.value > 0)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (parsed.length < 2) {
      return buildSyntheticSeries(fallbackPrice, timeframe);
    }

    return parsed;
  } catch {
    return buildSyntheticSeries(fallbackPrice, timeframe);
  }
}

function getHistoryGroup(timestampSec: number): HistoryGroup {
  const date = new Date(timestampSec * 1000);
  const now = new Date();

  if (date.getTime() > now.getTime()) return "PENDING";

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date >= today) return "TODAY";
  if (date >= yesterday) return "YESTERDAY";
  return "YESTERDAY";
}

function mapTransactionKind(tx: AlgorandTransaction): TxKind {
  const label = tx.label?.toLowerCase() ?? "";

  if (label.includes("bundle")) return "swap";
  if (label.includes("scheduled")) return "stake";
  if (tx.appId) return "deploy";
  if (tx.type === "sent") return "send";
  return "receive";
}

function txEmoji(kind: TxKind): string {
  if (kind === "swap") return "🔄";
  if (kind === "send") return "↑";
  if (kind === "receive") return "↓";
  if (kind === "deploy") return "📦";
  return "🔒";
}

function txDescription(kind: TxKind, symbol: string): string {
  if (kind === "swap") return `Swap ${symbol}`;
  if (kind === "send") return `Send ${symbol}`;
  if (kind === "receive") return `Receive ${symbol}`;
  if (kind === "deploy") return "Deploy Contract";
  return "Stake Position";
}

function positionMatchesAsset(position: StoredPosition, assetId: number, symbol: string): boolean {
  if (position.asaIds.includes(assetId)) return true;
  return position.asaIds.some((id) => (ASA_ID_TO_PYTH_SYMBOL[id] ?? "") === symbol);
}

export default function AssetDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const parsedAssetId = Number(params.assetId ?? params.id ?? SYNTHETIC_ASA_IDS.ALGO);
  const assetId = Number.isFinite(parsedAssetId) ? parsedAssetId : SYNTHETIC_ASA_IDS.ALGO;

  const initialSymbol = useMemo(() => {
    const routeSymbol = String(params.symbol ?? "").trim().toUpperCase();
    if (routeSymbol) return routeSymbol;
    return ASA_ID_TO_PYTH_SYMBOL[assetId] ?? "ALGO";
  }, [assetId, params.symbol]);

  const assetMeta = SYMBOL_META[initialSymbol] ?? {
    name: String(params.name ?? "Asset"),
    defaultPair: `${initialSymbol}/USDC`,
    buyLabel: `Buy ${initialSymbol}`,
  };

  const assetName = String(params.name ?? assetMeta.name);
  const [networkFilter, setNetworkFilter] = useState<NetworkFilter>("all");
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [activeTab, setActiveTab] = useState(0);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const [dismissedOpenPositions, setDismissedOpenPositions] = useState<number[]>([]);

  const pulseOpacity = useRef(new Animated.Value(0.35)).current;
  const previousScrubIndex = useRef<number>(-1);

  const chartWidth = Dimensions.get("window").width - H_PAD * 2;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 0.35,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseOpacity]);

  const assetQuery = useQuery<AssetSnapshot>({
    queryKey: ["asset", assetId],
    queryFn: async () => {
      const wallet = await algorandService.initializeWallet();

      const [balance, transactions, positions] = await Promise.all([
        algorandService.getBalance(wallet.address),
        algorandService.getTransactionHistory(wallet.address, 42, ["pay", "appl"]),
        positionStore.getAll(),
      ]);

      return {
        walletAddress: wallet.address,
        balanceAlgo: Number(balance.algo) || 0,
        transactions,
        positions: positions.filter((position) => positionMatchesAsset(position, assetId, initialSymbol)),
      };
    },
    staleTime: 15_000,
  });

  const priceQuery = useQuery<PriceSnapshot>({
    queryKey: ["price", assetId, initialSymbol, timeframe],
    queryFn: async () => {
      const routePrice = Number(params.price ?? NaN);
      const oracle = await pythOracleService.getPrice(initialSymbol);
      const livePrice =
        Number.isFinite(routePrice) && routePrice > 0
          ? routePrice
          : oracle?.price && Number.isFinite(oracle.price)
            ? oracle.price
            : 0;

      const points = await fetchDefiLlamaSeries(initialSymbol, timeframe, Math.max(0.000001, livePrice || 1));
      const first = points[0]?.value ?? livePrice;
      const last = points[points.length - 1]?.value ?? livePrice;
      const changeAmount = last - first;
      const changePct = first > 0 ? (changeAmount / first) * 100 : 0;

      return {
        livePrice: Math.max(0.000001, livePrice || last || first || 1),
        points,
        changePct,
        changeAmount,
      };
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    setScrubIndex(null);
    previousScrubIndex.current = -1;
  }, [timeframe, assetId, networkFilter, priceQuery.dataUpdatedAt]);

  const chartPoints = priceQuery.data?.points ?? [];

  const displayPrice = useMemo(() => {
    if (scrubIndex != null && scrubIndex >= 0 && scrubIndex < chartPoints.length) {
      return chartPoints[scrubIndex].value;
    }
    return priceQuery.data?.livePrice ?? 0;
  }, [chartPoints, priceQuery.data?.livePrice, scrubIndex]);

  const liveChangeAmount = priceQuery.data?.changeAmount ?? 0;
  const liveChangePct = priceQuery.data?.changePct ?? 0;

  const scoreLabel = liveChangePct > -2 ? "A" : "B";
  const scoreVariant = scoreLabel === "A" ? "success" : "warning";
  const chartLineColor = liveChangePct >= 0 ? C.brand.black : C.semantic.danger;

  const onCurrentIndexChange = useCallback(
    (next: number) => {
      if (!Number.isFinite(next) || chartPoints.length === 0) return;

      const clamped = Math.max(0, Math.min(chartPoints.length - 1, Math.round(next)));
      setScrubIndex(clamped);

      if (previousScrubIndex.current !== clamped) {
        previousScrubIndex.current = clamped;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    [chartPoints],
  );

  const txRows = useMemo<TxRowModel[]>(() => {
    const source = assetQuery.data?.transactions ?? [];
    return source
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((tx) => {
        const kind = mapTransactionKind(tx);
        return {
          id: tx.txId,
          group: getHistoryGroup(tx.timestamp),
          kind,
          amountAlgo: Number(tx.amount ?? 0) / 1_000_000,
          timestampSec: tx.timestamp,
          description: txDescription(kind, initialSymbol),
          hash: tx.txId,
          rawType: tx.type,
        };
      });
  }, [assetQuery.data?.transactions, initialSymbol]);

  const historyItems = useMemo<HistoryListItem[]>(() => {
    const grouped: Record<HistoryGroup, TxRowModel[]> = {
      PENDING: [],
      TODAY: [],
      YESTERDAY: [],
    };

    txRows.forEach((row) => grouped[row.group].push(row));

    const out: HistoryListItem[] = [];

    HISTORY_GROUP_ORDER.forEach((group) => {
      const rows = grouped[group];
      if (rows.length === 0) return;

      out.push({ key: `header-${group}`, type: "header", title: group });
      rows.forEach((row) => {
        out.push({ key: `tx-${row.id}`, type: "tx", row });
      });
    });

    return out;
  }, [txRows]);

  const openPositions = useMemo<OpenPositionCard[]>(() => {
    const base = assetQuery.data?.positions ?? [];
    const visible = base.filter(
      (position) => !dismissedOpenPositions.includes(position.positionId),
    );

    return visible.map((position, index) => {
      const protocol = index % 2 === 0 ? "QuickSwap" : "Liquidity Pool";
      const pair = `${initialSymbol}/${index % 2 === 0 ? "USDC" : "POLYGON"}`;
      const usdValue = position.marginAlgo * (priceQuery.data?.livePrice ?? 0);

      return {
        id: position.positionId,
        protocol,
        pair,
        usdValue: Number.isFinite(usdValue) ? usdValue : 0,
      };
    });
  }, [assetQuery.data?.positions, dismissedOpenPositions, initialSymbol, priceQuery.data?.livePrice]);

  const stats = useMemo(() => {
    const price = Math.max(0, priceQuery.data?.livePrice ?? displayPrice);
    const balance = assetQuery.data?.balanceAlgo ?? 0;

    return {
      lastSale: formatUsd(price),
      floorPrice: (price * 0.72).toFixed(price < 1 ? 4 : 2),
      volume24h: `${formatUsd(Math.max(1000, price * 6000), 1)}`,
      marketCap: `${formatUsd(Math.max(10_000_000, price * 300_000_000), 0)}`,
      balance,
    };
  }, [assetQuery.data?.balanceAlgo, displayPrice, priceQuery.data?.livePrice]);

  const closeOpenPositionCard = (positionId: number) => {
    setDismissedOpenPositions((prev) => (prev.includes(positionId) ? prev : [...prev, positionId]));
  };

  const historyRenderItem: ListRenderItem<HistoryListItem> = ({ item }) => {
    if (item.type === "header") {
      return <Text style={styles.historyHeader}>{item.title}</Text>;
    }

    const row = item.row;
    const amountIsPositive = row.rawType === "received";
    const amountText = row.kind === "deploy" || row.kind === "stake"
      ? "App"
      : `${amountIsPositive ? "+" : "-"}${formatAlgo(Math.abs(row.amountAlgo))}`;

    return (
      <View style={styles.txRow}>
        <View style={styles.txIconBubble}>
          <Text style={styles.txEmoji}>{txEmoji(row.kind)}</Text>
        </View>

        <View style={styles.txCenter}>
          <Text style={styles.txDescription}>{row.description}</Text>
          <Text style={styles.txMeta}>{truncateHash(row.hash)} · {formatTimeLabel(row.timestampSec)}</Text>
        </View>

        <Text
          style={[
            styles.txAmount,
            amountIsPositive ? styles.amountPositive : styles.amountNegative,
            (row.kind === "deploy" || row.kind === "stake") && styles.amountNeutral,
          ]}
        >
          {amountText}
        </Text>
      </View>
    );
  };

  const openRenderItem: ListRenderItem<OpenPositionCard> = ({ item }) => {
    return (
      <View style={styles.openCard}>
        <View style={styles.openCardTopRow}>
          <StatusTag label={item.protocol} variant="purple" />
          <TouchableOpacity
            style={styles.closePill}
            onPress={() => closeOpenPositionCard(item.id)}
            accessibilityRole="button"
            accessibilityLabel="Close open position card"
          >
            <Ionicons name="close" size={14} color={C.text.t1} />
          </TouchableOpacity>
        </View>

        <Text style={styles.openPair}>{item.pair}</Text>
        <Text style={styles.openValue}>{formatUsd(item.usdValue)}</Text>
      </View>
    );
  };

  const headerBlock = (
    <View>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color={C.text.t1} />
        </TouchableOpacity>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {assetName} ({initialSymbol})
        </Text>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Asset information"
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          onPress={() => {
            void Haptics.selectionAsync();
          }}
        >
          <Ionicons name="information-circle-outline" size={20} color={C.text.t2} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={NETWORKS}
        keyExtractor={(item) => item.key}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.networkRow}
        renderItem={({ item }) => {
          const active = networkFilter === item.key;
          return (
            <TouchableOpacity
              style={[
                styles.networkPill,
                active && { backgroundColor: item.color, borderColor: item.color },
              ]}
              onPress={() => {
                setNetworkFilter(item.key);
                void Haptics.selectionAsync();
              }}
              accessibilityRole="button"
              accessibilityLabel={`Filter ${item.label}`}
              accessibilityState={{ selected: active }}
            >
              <View style={[styles.networkDot, { backgroundColor: item.color }]} />
              <Text style={[styles.networkText, active && styles.networkTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <View style={styles.heroWrap}>
        {priceQuery.isLoading ? (
          <Animated.View style={[styles.heroSkeleton, { opacity: pulseOpacity }]} />
        ) : (
          <>
            <Text style={styles.heroPrice}>{formatUsd(displayPrice)}</Text>
            <Text style={[styles.heroDelta, liveChangePct >= 0 ? styles.deltaUp : styles.deltaDown]}>
              {liveChangeAmount >= 0 ? "+" : ""}
              {formatUsd(Math.abs(liveChangeAmount))} ({liveChangePct >= 0 ? "+" : ""}
              {liveChangePct.toFixed(2)}%)
            </Text>
          </>
        )}

        <StatusTag
          label={scoreLabel}
          variant={scoreVariant}
          style={styles.scorePill}
          textStyle={styles.scoreText}
        />
      </View>

      <View style={styles.chartContainer}>
        {priceQuery.isLoading ? (
          <Animated.View style={[styles.chartSkeleton, { opacity: pulseOpacity }]} />
        ) : chartPoints.length > 1 ? (
          <LineChart.Provider data={chartPoints} onCurrentIndexChange={onCurrentIndexChange}>
            <LineChart width={chartWidth} height={120} yGutter={6}>
              <LineChart.Path color={chartLineColor} width={3} />
              <LineChart.CursorCrosshair color={C.brand.black} />
              <LineChart.Tooltip
                position="top"
                yGutter={10}
                withHorizontalFloating
                style={styles.tooltip}
                textStyle={styles.tooltipText}
              />
            </LineChart>
          </LineChart.Provider>
        ) : (
          <View style={styles.emptyChart}>
            <Text style={styles.emptyText}>No chart data yet</Text>
          </View>
        )}
      </View>

      <View style={styles.timeframeRow}>
        {TIMEFRAMES.map((item) => {
          const active = item === timeframe;
          return (
            <TouchableOpacity
              key={item}
              style={[styles.timeframePill, active && styles.timeframePillActive]}
              onPress={() => {
                setTimeframe(item);
                void Haptics.selectionAsync();
              }}
              accessibilityRole="button"
              accessibilityLabel={`Show ${item} chart`}
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.timeframeText, active && styles.timeframeTextActive]}>{item}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.statsWrap}>
        <StatCard label="Last Sale" value={stats.lastSale} style={styles.statCard} />
        <StatCard label="Floor Price" value={stats.floorPrice} style={styles.statCard} />
        <StatCard label="Volume 24h" value={stats.volume24h} style={styles.statCard} />
        <StatCard label="Market Cap" value={stats.marketCap} style={styles.statCard} />
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.plusButton}
          accessibilityRole="button"
          accessibilityLabel="Add to watchlist"
          onPress={() => {
            void Haptics.selectionAsync();
          }}
        >
          <Ionicons name="add" size={20} color={C.text.tInv} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.buyButton}
          accessibilityRole="button"
          accessibilityLabel={assetMeta.buyLabel}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Text style={styles.buyButtonText}>{assetMeta.buyLabel}</Text>
        </TouchableOpacity>
      </View>

      <SegmentTabs
        tabs={["History", "Open"]}
        activeIndex={activeTab}
        onTabChange={setActiveTab}
        style={styles.segmentTabs}
      />
    </View>
  );

  const emptyHistory = (
    <View style={styles.emptyStateWrap}>
      <Text style={styles.emptyText}>No transaction history for this asset yet.</Text>
    </View>
  );

  const emptyOpen = (
    <View style={styles.emptyStateWrap}>
      <Text style={styles.emptyText}>No open DeFi positions for {initialSymbol}.</Text>
    </View>
  );

  return (
    <ScreenContainer style={styles.container}>
      {activeTab === 0 ? (
        <FlatList
          data={historyItems}
          keyExtractor={(item) => item.key}
          renderItem={historyRenderItem}
          ListHeaderComponent={headerBlock}
          ListEmptyComponent={!assetQuery.isLoading ? emptyHistory : null}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.contentContainer}
        />
      ) : (
        <FlatList
          data={openPositions}
          keyExtractor={(item) => String(item.id)}
          renderItem={openRenderItem}
          ListHeaderComponent={headerBlock}
          ListEmptyComponent={!assetQuery.isLoading ? emptyOpen : null}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.contentContainer}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.surfaces.bgBase,
  },
  contentContainer: {
    paddingBottom: S.xl,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: H_PAD,
    paddingVertical: 14,
  },
  headerTitle: {
    ...T.h2,
    color: C.text.t1,
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },
  networkRow: {
    paddingHorizontal: H_PAD,
    gap: S.sm,
    paddingBottom: S.sm,
  },
  networkPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: C.surfaces.bgBase,
    gap: 6,
  },
  networkDot: {
    width: 8,
    height: 8,
    borderRadius: R.full,
  },
  networkText: {
    ...T.sm,
    color: C.text.t2,
  },
  networkTextActive: {
    color: C.text.tInv,
    fontFamily: "DMSans_700Bold",
  },
  heroWrap: {
    paddingHorizontal: H_PAD,
    paddingVertical: 16,
  },
  heroPrice: {
    ...T.display,
    color: C.text.t1,
  },
  heroDelta: {
    ...T.sm,
    marginTop: 6,
  },
  deltaUp: {
    color: C.semantic.success,
  },
  deltaDown: {
    color: C.semantic.danger,
  },
  scorePill: {
    alignSelf: "flex-start",
    marginTop: 10,
    backgroundColor: "rgba(18,183,106,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  scoreText: {
    ...T.smBold,
    color: C.semantic.success,
  },
  heroSkeleton: {
    height: 84,
    borderRadius: R.md,
    backgroundColor: C.surfaces.bgSurface,
  },
  chartContainer: {
    paddingHorizontal: H_PAD,
    minHeight: 130,
    justifyContent: "center",
  },
  chartSkeleton: {
    height: 120,
    borderRadius: R.md,
    backgroundColor: C.surfaces.bgSurface,
  },
  emptyChart: {
    height: 120,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  tooltip: {
    backgroundColor: C.brand.black,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tooltipText: {
    ...T.smBold,
    color: C.text.tInv,
  },
  timeframeRow: {
    paddingHorizontal: H_PAD,
    marginTop: 8,
    flexDirection: "row",
    gap: S.sm,
  },
  timeframePill: {
    borderRadius: R.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "transparent",
  },
  timeframePillActive: {
    backgroundColor: C.brand.black,
  },
  timeframeText: {
    ...T.bodyMd,
    color: C.text.t2,
  },
  timeframeTextActive: {
    color: C.text.tInv,
  },
  statsWrap: {
    paddingHorizontal: H_PAD,
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: S.sm,
  },
  statCard: {
    width: "48%",
  },
  actionRow: {
    paddingHorizontal: H_PAD,
    flexDirection: "row",
    gap: S.sm,
    marginTop: 12,
    alignItems: "center",
  },
  plusButton: {
    width: 40,
    height: 40,
    borderRadius: R.full,
    backgroundColor: C.semantic.info,
    alignItems: "center",
    justifyContent: "center",
  },
  buyButton: {
    flex: 1,
    height: 40,
    borderRadius: R.full,
    backgroundColor: C.brand.black,
    alignItems: "center",
    justifyContent: "center",
  },
  buyButtonText: {
    ...T.bodyMd,
    color: C.text.tInv,
    fontFamily: "DMSans_700Bold",
  },
  segmentTabs: {
    marginTop: 14,
    paddingHorizontal: H_PAD,
  },
  historyHeader: {
    ...T.smBold,
    color: C.text.t2,
    letterSpacing: 0.5,
    paddingHorizontal: H_PAD,
    marginTop: 14,
    marginBottom: 6,
  },
  txRow: {
    paddingHorizontal: H_PAD,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  txIconBubble: {
    width: 36,
    height: 36,
    borderRadius: R.full,
    backgroundColor: C.surfaces.bgSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  txEmoji: {
    fontSize: 14,
  },
  txCenter: {
    flex: 1,
    gap: 2,
  },
  txDescription: {
    ...T.bodyMd,
    color: C.text.t1,
  },
  txMeta: {
    ...T.hash,
    color: C.text.t2,
  },
  txAmount: {
    ...T.bodyMd,
    fontFamily: "DMSans_700Bold",
  },
  amountPositive: {
    color: C.semantic.success,
  },
  amountNegative: {
    color: C.semantic.danger,
  },
  amountNeutral: {
    color: C.text.t2,
  },
  openCard: {
    marginHorizontal: H_PAD,
    marginTop: 12,
    padding: 14,
    borderRadius: R.lg,
    backgroundColor: C.surfaces.bgSurface,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    gap: 8,
  },
  openCardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  closePill: {
    width: 26,
    height: 26,
    borderRadius: R.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaces.bgBase,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
  },
  openPair: {
    ...T.bodyMd,
    color: C.text.t1,
  },
  openValue: {
    ...T.h3,
    color: C.text.t1,
    fontFamily: "DMSans_700Bold",
  },
  emptyStateWrap: {
    marginTop: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: H_PAD,
  },
  emptyText: {
    ...T.body,
    color: C.text.t2,
    textAlign: "center",
  },
});