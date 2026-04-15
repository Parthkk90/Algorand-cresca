import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { TxSkeletonRow } from '../components/SkeletonRow';
import { Anim, Colors, Radius, Spacing, Typography } from '../constants/theme';

type Asset = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  marketCapRank: number;
  ecosystem: 'EVM' | 'Non-EVM';
  sectors: string[];
};

const FILTERS = ['All', 'EVM', 'Non-EVM', 'DeFi', 'Stablecoins'];
const RATE_LIMIT_COOLDOWN_MS = 2 * 60 * 1000;

type MarketMeta = {
  symbol: string;
  name: string;
  ecosystem: 'EVM' | 'Non-EVM';
  sectors: string[];
};

const MARKET_META: Record<string, MarketMeta> = {
  algorand: { symbol: 'ALGO', name: 'Algorand', ecosystem: 'Non-EVM', sectors: ['L1'] },
  'usd-coin': { symbol: 'USDC', name: 'USD Coin', ecosystem: 'EVM', sectors: ['Stablecoins'] },
  tether: { symbol: 'USDT', name: 'Tether', ecosystem: 'EVM', sectors: ['Stablecoins'] },
  bitcoin: { symbol: 'BTC', name: 'Bitcoin', ecosystem: 'Non-EVM', sectors: ['Store of Value'] },
  ethereum: { symbol: 'ETH', name: 'Ethereum', ecosystem: 'EVM', sectors: ['L1'] },
  solana: { symbol: 'SOL', name: 'Solana', ecosystem: 'Non-EVM', sectors: ['L1'] },
  'avalanche-2': { symbol: 'AVAX', name: 'Avalanche', ecosystem: 'EVM', sectors: ['L1'] },
  'binancecoin': { symbol: 'BNB', name: 'BNB', ecosystem: 'EVM', sectors: ['L1'] },
  ripple: { symbol: 'XRP', name: 'XRP', ecosystem: 'Non-EVM', sectors: ['Payments'] },
  cardano: { symbol: 'ADA', name: 'Cardano', ecosystem: 'Non-EVM', sectors: ['L1'] },
  sui: { symbol: 'SUI', name: 'Sui', ecosystem: 'Non-EVM', sectors: ['L1'] },
  aptos: { symbol: 'APT', name: 'Aptos', ecosystem: 'Non-EVM', sectors: ['L1'] },
  near: { symbol: 'NEAR', name: 'NEAR', ecosystem: 'Non-EVM', sectors: ['L1'] },
  'chainlink': { symbol: 'LINK', name: 'Chainlink', ecosystem: 'EVM', sectors: ['DeFi'] },
  uniswap: { symbol: 'UNI', name: 'Uniswap', ecosystem: 'EVM', sectors: ['DeFi'] },
  aave: { symbol: 'AAVE', name: 'Aave', ecosystem: 'EVM', sectors: ['DeFi'] },
  'lido-dao': { symbol: 'LDO', name: 'Lido DAO', ecosystem: 'EVM', sectors: ['DeFi'] },
  arbitrum: { symbol: 'ARB', name: 'Arbitrum', ecosystem: 'EVM', sectors: ['L2'] },
  optimism: { symbol: 'OP', name: 'Optimism', ecosystem: 'EVM', sectors: ['L2'] },
  'polygon-ecosystem-token': { symbol: 'POL', name: 'Polygon', ecosystem: 'EVM', sectors: ['L2'] },
};

const MARKET_IDS = Object.keys(MARKET_META);
const SYMBOL_MAP: Record<string, string> = {
  algorand: 'ALGO',
  'usd-coin': 'USDC',
  tether: 'USDT',
  bitcoin: 'BTC',
  ethereum: 'ETH',
  solana: 'SOL',
  'avalanche-2': 'AVAX',
  binancecoin: 'BNB',
  ripple: 'XRP',
  cardano: 'ADA',
  sui: 'SUI',
  aptos: 'APT',
  near: 'NEAR',
  chainlink: 'LINK',
  uniswap: 'UNI',
  aave: 'AAVE',
  'lido-dao': 'LDO',
  arbitrum: 'ARB',
  optimism: 'OP',
  'polygon-ecosystem-token': 'POL',
};

const MARKETS_CACHE_KEY = 'cresca_markets_cache_v1';
const MARKET_FALLBACK_ROWS: Asset[] = [
  { symbol: 'ALGO', name: 'Algorand', price: 0.18, change: 0, marketCapRank: 0, ecosystem: 'Non-EVM', sectors: ['L1'] },
  { symbol: 'BTC', name: 'Bitcoin', price: 70000, change: 0, marketCapRank: 0, ecosystem: 'Non-EVM', sectors: ['Store of Value'] },
  { symbol: 'ETH', name: 'Ethereum', price: 3000, change: 0, marketCapRank: 0, ecosystem: 'EVM', sectors: ['L1'] },
  { symbol: 'SOL', name: 'Solana', price: 100, change: 0, marketCapRank: 0, ecosystem: 'Non-EVM', sectors: ['L1'] },
  { symbol: 'AVAX', name: 'Avalanche', price: 35, change: 0, marketCapRank: 0, ecosystem: 'EVM', sectors: ['L1'] },
  { symbol: 'XRP', name: 'XRP', price: 0.6, change: 0, marketCapRank: 0, ecosystem: 'Non-EVM', sectors: ['Payments'] },
  { symbol: 'ARB', name: 'Arbitrum', price: 1.1, change: 0, marketCapRank: 0, ecosystem: 'EVM', sectors: ['L2'] },
  { symbol: 'LINK', name: 'Chainlink', price: 18, change: 0, marketCapRank: 0, ecosystem: 'EVM', sectors: ['DeFi'] },
  { symbol: 'USDC', name: 'USD Coin', price: 1.0, change: 0, marketCapRank: 0, ecosystem: 'EVM', sectors: ['Stablecoins'] },
];

// Per-asset animated flash when price updates
function usePriceFlash() {
  const flash = useRef(new Animated.Value(0)).current;
  const trigger = useCallback(() => {
    flash.setValue(1);
    Animated.timing(flash, {
      toValue: 0,
      duration: Anim.slow,
      useNativeDriver: false,
    }).start();
  }, [flash]);
  const bg = flash.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', Colors.gain + '22'],
  });
  return { trigger, bg };
}

function AssetRow({ asset, isLast }: { asset: Asset; isLast: boolean }) {
  const { trigger, bg } = usePriceFlash();
  const prevPrice = useRef(asset.price);

  useEffect(() => {
    if (prevPrice.current !== asset.price) {
      trigger();
      prevPrice.current = asset.price;
    }
  }, [asset.price, trigger]);

  const isUp = asset.change > 0;
  const isDown = asset.change < 0;
  const tagFor = (change: number) => {
    if (Math.abs(change) < 0.5) return 'STABLE';
    if (Math.abs(change) >= 3) return 'HIGH';
    return 'MED';
  };

  return (
    <Animated.View
      style={[
        styles.assetRow,
        isLast && styles.assetRowLast,
        { backgroundColor: bg },
      ]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${asset.name}, price $${asset.price.toLocaleString()}, ${asset.change > 0 ? 'up' : asset.change < 0 ? 'down' : 'flat'} ${Math.abs(asset.change).toFixed(1)} percent`}
    >
      <View>
        <View style={styles.symbolRow}>
          <Text style={styles.assetSymbol}>{asset.symbol}</Text>
          <View style={styles.tagChip}>
            <Text style={styles.tagText}>{tagFor(asset.change)}</Text>
          </View>
        </View>
        <Text style={styles.assetName}>{asset.name} · #{asset.marketCapRank || '--'}</Text>
      </View>
      <View style={styles.assetRight}>
        <Text style={[styles.assetPrice, { fontVariant: ['tabular-nums'] }]}>
          ${asset.price.toLocaleString(undefined, {
            maximumFractionDigits: asset.price > 100 ? 2 : 4,
          })}
        </Text>
        <View style={styles.changeRow}>
          <Ionicons
            name={isUp ? 'arrow-up' : isDown ? 'arrow-down' : 'remove'}
            size={10}
            color={isUp ? Colors.gain : isDown ? Colors.loss : Colors.text.muted}
          />
          <Text
            style={[
              styles.assetChange,
              { fontVariant: ['tabular-nums'] },
              isUp ? styles.up : isDown ? styles.down : styles.flat,
            ]}
          >
            {Math.abs(asset.change).toFixed(1)}%
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

export default function MarketsScreen() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rateLimitUntilRef = useRef(0);

  // Stagger entrance
  const listAnim = useRef(new Animated.Value(0)).current;

  const loadMarkets = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        setLoading(true);
      }
      setError(null);

      const now = Date.now();
      if (now < rateLimitUntilRef.current) {
        const cacheRaw = await AsyncStorage.getItem(MARKETS_CACHE_KEY);
        const cached = cacheRaw ? (JSON.parse(cacheRaw) as Asset[]) : [];
        if (cached.length > 0) {
          setAssets(cached);
          setError('Live market snapshot is rate-limited · showing cached data');
          return;
        }
      }

      const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${MARKET_IDS.join(',')}&price_change_percentage=24h`;
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 429) {
          rateLimitUntilRef.current = Date.now() + RATE_LIMIT_COOLDOWN_MS;
        }
        throw new Error(`Market API ${res.status}`);
      }

      const data = await res.json();
      const rows: Asset[] = (Array.isArray(data) ? data : [])
        .map((item: any) => ({
          symbol: SYMBOL_MAP[item.id] ?? String(item.symbol || '').toUpperCase(),
          name: MARKET_META[item.id]?.name ?? String(item.name || item.id || 'Asset'),
          price: Number(item.current_price ?? NaN),
          change: Number(item.price_change_percentage_24h ?? 0),
          marketCapRank: Number(item.market_cap_rank ?? 0),
          ecosystem: MARKET_META[item.id]?.ecosystem ?? 'Non-EVM',
          sectors: MARKET_META[item.id]?.sectors ?? [],
        }))
        .filter((row) => Number.isFinite(row.price));

      setAssets(rows);
      await AsyncStorage.setItem(MARKETS_CACHE_KEY, JSON.stringify(rows));

      // Entrance fade on first load
      if (!isRefresh) {
        listAnim.setValue(0);
        Animated.timing(listAnim, {
          toValue: 1,
          duration: Anim.normal,
          useNativeDriver: true,
        }).start();
      }
    } catch (err: any) {
      const msg = err?.message ?? 'Could not load markets';
      const cacheRaw = await AsyncStorage.getItem(MARKETS_CACHE_KEY);
      const cached = cacheRaw ? (JSON.parse(cacheRaw) as Asset[]) : [];
      const fallback = cached.length > 0 ? cached : MARKET_FALLBACK_ROWS;
      setAssets(fallback);
      if (msg.includes('429')) {
        setError('Live market snapshot is rate-limited · showing cached data');
      } else {
        setError(`${msg} · showing cached data`);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [listAnim]);

  useEffect(() => {
    void loadMarkets();
  }, [loadMarkets]);

  useEffect(() => {
    const id = setInterval(() => void loadMarkets(true), 90000);
    return () => clearInterval(id);
  }, [loadMarkets]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      const queryMatches =
        q.length === 0 ||
        a.symbol.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q);

      if (!queryMatches) return false;
      if (activeFilter === 'All') return true;
      if (activeFilter === 'EVM') return a.ecosystem === 'EVM';
      if (activeFilter === 'Non-EVM') return a.ecosystem === 'Non-EVM';
      if (activeFilter === 'DeFi') return a.sectors.includes('DeFi');
      if (activeFilter === 'Stablecoins') return a.sectors.includes('Stablecoins');
      return true;
    });
  }, [query, assets, activeFilter]);

  return (
    <ScreenContainer style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Markets</Text>
        <Text style={styles.subtitle}>Top collections and token movement across Algorand.</Text>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={Colors.text.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search assets"
            value={query}
            onChangeText={setQuery}
            placeholderTextColor={Colors.text.muted}
            accessibilityLabel="Search assets"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery('')}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={16} color={Colors.text.muted} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
        >
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
              onPress={() => {
                setActiveFilter(f);
                void Haptics.selectionAsync();
              }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${f}`}
              accessibilityState={{ selected: activeFilter === f }}
            >
              <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.tokensCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Live Token Board</Text>
            <TouchableOpacity
              onPress={() => void loadMarkets(true)}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Refresh market data"
            >
              <View style={styles.refreshBtn}>
                <Ionicons
                  name="refresh"
                  size={14}
                  color={refreshing ? Colors.text.muted : Colors.tertiary}
                  style={refreshing ? styles.spinning : undefined}
                />
                <Text style={[styles.sectionHint, refreshing && styles.sectionHintMuted]}>
                  {refreshing ? 'Updating…' : 'Refresh'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Skeleton loading */}
          {loading && (
            <View style={styles.skeletonWrap}>
              <TxSkeletonRow />
              <TxSkeletonRow />
              <TxSkeletonRow />
              <TxSkeletonRow />
              <TxSkeletonRow />
            </View>
          )}

          {/* Error state */}
          {!loading && error && shown.length === 0 && (
            <View style={styles.errorCard}>
              <Ionicons name="cloud-offline-outline" size={28} color={Colors.loss} />
              <Text style={styles.errorTitle}>Could not load markets</Text>
              <Text style={styles.errorDetail}>{error}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => void loadMarkets()}
                accessibilityRole="button"
                accessibilityLabel="Retry loading markets"
              >
                <Ionicons name="refresh" size={14} color={Colors.bg.screen} />
                <Text style={styles.retryText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          )}

          {!loading && error && shown.length > 0 && (
            <View style={styles.warningRow}>
              <Ionicons name="warning-outline" size={14} color={Colors.loss} />
              <Text style={styles.warningText}>{error}</Text>
            </View>
          )}

          {/* Empty state */}
          {!loading && shown.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={28} color={Colors.text.muted} />
              <Text style={styles.emptyText}>No assets match "{query}"</Text>
            </View>
          )}

          {/* Asset list */}
          {!loading && shown.length > 0 && (
            <Animated.View style={{ opacity: listAnim }}>
              {shown.map((asset, index) => (
                <AssetRow key={asset.symbol} asset={asset} isLast={index === shown.length - 1} />
              ))}
            </Animated.View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.screen },
  content: { padding: Spacing.xl, paddingBottom: 44 },
  title: {
    fontSize: Typography.xxl,
    color: Colors.text.primary,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 6,
    fontSize: Typography.sm,
    color: Colors.text.muted,
    marginBottom: Spacing.md,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginBottom: Spacing.md,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: Typography.sm,
  },
  filtersRow: { gap: 8, paddingBottom: Spacing.md },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.bg.subtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: {
    color: Colors.text.muted,
    fontSize: Typography.xs,
    fontWeight: '600',
  },
  filterTextActive: { color: Colors.bg.screen },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    color: Colors.text.primary,
    fontSize: Typography.base,
    fontWeight: '600',
  },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionHint: { color: Colors.tertiary, fontSize: Typography.xs },
  sectionHintMuted: { color: Colors.text.muted },
  spinning: { opacity: 0.5 },
  tokensCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  skeletonWrap: { gap: 4 },
  assetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    borderRadius: Radius.sm,
    paddingHorizontal: 4,
    marginHorizontal: -4,
  },
  assetRowLast: { borderBottomWidth: 0 },
  symbolRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  assetSymbol: {
    color: Colors.text.primary,
    fontSize: Typography.sm,
    fontWeight: '700',
  },
  tagChip: {
    backgroundColor: Colors.bg.subtle,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagText: { color: Colors.text.muted, fontSize: 10, fontWeight: '600' },
  assetName: { color: Colors.text.muted, fontSize: Typography.xs, marginTop: 2 },
  assetRight: { alignItems: 'flex-end' },
  assetPrice: {
    color: Colors.text.primary,
    fontSize: Typography.sm,
    fontWeight: '600',
  },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  assetChange: { fontSize: Typography.xs, fontWeight: '600' },
  up: { color: Colors.gain },
  down: { color: Colors.loss },
  flat: { color: Colors.text.muted },
  errorCard: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  errorTitle: {
    color: Colors.text.primary,
    fontSize: Typography.base,
    fontWeight: '600',
  },
  errorDetail: {
    color: Colors.text.muted,
    fontSize: Typography.xs,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: Radius.full,
    marginTop: 4,
  },
  retryText: {
    color: Colors.bg.screen,
    fontSize: Typography.sm,
    fontWeight: '600',
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.bg.subtle,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    marginBottom: Spacing.sm,
  },
  warningText: {
    flex: 1,
    color: Colors.text.muted,
    fontSize: Typography.xs,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyText: {
    color: Colors.text.muted,
    fontSize: Typography.sm,
  },
});
