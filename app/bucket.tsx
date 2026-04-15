import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppNoticeAction, AppNoticeModal, AppNoticeTone } from '../components/AppNoticeModal';
import { ScreenContainer } from '../components/ScreenContainer';
import { BASKETS, Basket, basketToContractArgs, getBasket } from '../constants/baskets';
import { Anim, Colors, Radius, Shadow, Spacing, Typography } from '../constants/theme';
import { algorandService } from '../services/algorandService';
import { crescaBucketService } from '../services/algorandContractServices';
import { dartRouterService } from '../services/dartRouterService';
import { pythOracleService } from '../services/pythOracleService';
import { positionStore, StoredPosition } from '../services/positionStore';

// ─── Static metadata per basket id ─────────────────────────────────────────

type Risk = 'Low' | 'Medium' | 'High';

interface BundleMeta {
  icon:       keyof typeof Ionicons.glyphMap;
  risk:       Risk;
  riskColor:  string;
  riskBg:     string;
  accent:     string;
}

const BUNDLE_META: Record<string, BundleMeta> = {
  'non-evm-giants':    { icon: 'globe-outline',            risk: 'Medium', riskColor: Colors.navy,  riskBg: '#2E4D6B55', accent: Colors.navy },
  'crypto-blue-chips': { icon: 'diamond-outline',          risk: 'Medium', riskColor: Colors.navy,  riskBg: '#2E4D6B55', accent: Colors.navy },
  'move-ecosystem':    { icon: 'git-branch-outline',       risk: 'High',   riskColor: Colors.navy,  riskBg: '#2E4D6B55', accent: Colors.navy },
  'speed-l1s':         { icon: 'flash-outline',            risk: 'High',   riskColor: Colors.navy,  riskBg: '#2E4D6B55', accent: Colors.navy },
  'store-of-value':    { icon: 'shield-checkmark-outline', risk: 'Low',    riskColor: Colors.navy,  riskBg: '#2E4D6B55', accent: Colors.navy },
};

const ALL_SYMBOLS = [...new Set(BASKETS.flatMap((b) => b.assets.map((a) => a.symbol)))];

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatUSD(price: number): string {
  if (price >= 10_000) return `$${Math.round(price).toLocaleString()}`;
  if (price >= 100)    return `$${price.toFixed(0)}`;
  if (price >= 1)      return `$${price.toFixed(2)}`;
  return `$${price.toFixed(3)}`;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Skeleton card ──────────────────────────────────────────────────────────

function SkeletonCard() {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1,   duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  return (
    <Animated.View style={[styles.card, { opacity: pulse }]}>
      <View style={styles.skelHead} />
      <View style={styles.skelDesc} />
      <View style={styles.skelRow}>
        {[60, 50, 60, 50, 45].map((w, i) => (
          <View key={i} style={[styles.skelChip, { width: w }]} />
        ))}
      </View>
      <View style={styles.divider} />
      <View style={styles.skelGrid}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.skelPrice} />
        ))}
      </View>
      <View style={styles.skelCta} />
    </Animated.View>
  );
}

// ─── Position card ──────────────────────────────────────────────────────────

function PositionCard({
  position,
  pnl,
  pnlLoading,
  onClose,
}: {
  position:   StoredPosition;
  pnl:        string | null;
  pnlLoading: boolean;
  onClose:    () => void;
}) {
  const basket  = getBasket(position.basketId);
  const meta    = BUNDLE_META[position.basketId];
  const accent  = meta?.accent ?? Colors.navy;
  const pnlNum  = pnl !== null ? parseFloat(pnl) : null;
  const isGain  = pnlNum !== null && pnlNum >= 0;
  const pnlColor = pnlNum === null ? Colors.text.muted : isGain ? Colors.gain : Colors.loss;

  // Entry value to compute pnl %
  const pnlPct = pnlNum !== null && position.marginAlgo > 0
    ? ((pnlNum / position.marginAlgo) * 100).toFixed(2)
    : null;

  return (
    <View style={styles.posCard}>
      {/* Accent stripe */}
      <View style={[styles.posAccent, { backgroundColor: accent }]} />

      {/* Header */}
      <View style={styles.posHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.posName} numberOfLines={1}>
            {basket?.name ?? position.basketId}
          </Text>
          <Text style={styles.posMeta}>
            {timeAgo(position.openedAt)} · {position.marginAlgo.toFixed(3)} ALGO margin
          </Text>
        </View>
        <View style={[styles.levBadge, { backgroundColor: accent + '22', borderColor: accent + '55' }]}>
          <Text style={[styles.levBadgeText, { color: accent }]}>{position.leverage}×</Text>
        </View>
      </View>

      <View style={styles.posDivider} />

      {/* P&L row */}
      <View style={styles.pnlRow}>
        <View>
          <Text style={styles.pnlLabel}>Unrealized P&L</Text>
          {pnlLoading
            ? <View style={styles.pnlSkeleton} />
            : (
              <View style={styles.pnlValueRow}>
                <Text style={[styles.pnlValue, { color: pnlColor, fontVariant: ['tabular-nums'] }]}>
                  {pnlNum !== null
                    ? `${isGain ? '+' : ''}${pnlNum.toFixed(4)} ALGO`
                    : '—'}
                </Text>
                {pnlPct !== null && (
                  <View style={[styles.pnlPctBadge, { backgroundColor: isGain ? Colors.gainBg + '55' : Colors.lossBg + '55' }]}>
                    <Text style={[styles.pnlPctText, { color: pnlColor }]}>
                      {isGain ? '+' : ''}{pnlPct}%
                    </Text>
                  </View>
                )}
              </View>
            )
          }
        </View>

        {/* Close button */}
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`Close position on ${basket?.name}`}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Ionicons name="close-circle" size={16} color={Colors.loss} />
          <Text style={styles.closeBtnText}>Close</Text>
        </TouchableOpacity>
      </View>

      {/* Txn link */}
      <TouchableOpacity
        onPress={() => Linking.openURL(`https://lora.algokit.io/testnet/transaction/${position.txId}`)}
        style={styles.txRow}
        hitSlop={{ top: 4, right: 4, bottom: 4, left: 4 }}
      >
        <Text style={styles.txText}>#{position.positionId} · View on Explorer</Text>
        <Ionicons name="open-outline" size={11} color={Colors.text.muted} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Bundle card ────────────────────────────────────────────────────────────

function BundleCard({
  basket,
  prices,
  onPress,
}: {
  basket:  Basket;
  prices:  Record<string, number>;
  onPress: () => void;
}) {
  const meta = BUNDLE_META[basket.id] ?? {
    icon: 'grid-outline', risk: 'Medium' as Risk,
    riskColor: Colors.navy, riskBg: '#2E4D6B55', accent: Colors.navy,
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={`Open ${basket.name}, ${meta.risk} risk bundle`}
    >
      <View style={[styles.cardAccent, { backgroundColor: meta.accent }]} />

      <View style={styles.cardHead}>
        <View style={[styles.iconWrap, { borderColor: meta.accent + '55' }]}>
          <Ionicons name={meta.icon} size={20} color={meta.accent} />
        </View>
        <View style={styles.cardTitleCol}>
          <Text style={styles.cardName}>{basket.name}</Text>
          <Text style={styles.cardDesc} numberOfLines={1}>{basket.description}</Text>
        </View>
        <View style={[styles.riskBadge, { backgroundColor: meta.riskBg }]}>
          <Text style={[styles.riskText, { color: meta.riskColor }]}>{meta.risk}</Text>
        </View>
      </View>

      <View style={styles.chipsRow}>
        {basket.assets.map((a) => (
          <View key={a.asaId} style={styles.chip}>
            <Text style={styles.chipSymbol}>{a.symbol}</Text>
            <Text style={styles.chipPct}>{a.weight}%</Text>
          </View>
        ))}
      </View>

      <View style={styles.divider} />

      <View style={styles.pricesGrid}>
        {basket.assets.map((a) => {
          const usd = prices[a.symbol];
          return (
            <View key={a.asaId} style={styles.priceCell}>
              <Text style={styles.priceSym}>{a.symbol}</Text>
              <Text style={[styles.priceVal, { fontVariant: ['tabular-nums'] }]}>
                {usd != null ? formatUSD(usd) : '—'}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.divider} />

      <View style={styles.ctaRow}>
        <Text style={[styles.ctaLabel, { color: meta.accent }]}>Trade This Bundle</Text>
        <Ionicons name="arrow-forward-circle" size={20} color={meta.accent} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function BundlesScreen() {
  const router = useRouter();

  const [prices,     setPrices]     = useState<Record<string, number>>({});
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Positions
  const [positions,   setPositions]   = useState<StoredPosition[]>([]);
  const [pnls,        setPnls]        = useState<Record<number, string>>({});
  const [pnlLoading,  setPnlLoading]  = useState(false);
  const [closingId,   setClosingId]   = useState<number | null>(null);
  const [notice,      setNotice]      = useState<{
    title: string;
    message: string;
    tone: AppNoticeTone;
    actions?: AppNoticeAction[];
  } | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ── Load prices ──────────────────────────────────────────────────────────

  const loadPrices = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      const result = await pythOracleService.getPrices(ALL_SYMBOLS);
      const map: Record<string, number> = {};
      Object.entries(result).forEach(([sym, p]) => { map[sym] = p.price; });
      setPrices(map);

      if (!isRefresh) {
        fadeAnim.setValue(0);
        Animated.timing(fadeAnim, {
          toValue: 1, duration: Anim.slow, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }).start();
      }
    } catch (err) {
      console.error('Failed to load bundle prices:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fadeAnim]);

  // ── Load positions ───────────────────────────────────────────────────────

  const loadPositions = useCallback(async () => {
    const stored = await positionStore.getAll();
    setPositions(stored);
    if (stored.length === 0) return;

    setPnlLoading(true);
    try {
      const addr = algorandService.getAddress();
      if (!addr) return;

      const results: Record<number, string> = {};
      await Promise.all(
        stored.map(async (pos) => {
          try {
            const pnl = await crescaBucketService.getUnrealizedPnL(addr, pos.positionId);
            results[pos.positionId] = pnl;
          } catch {
            // silently skip — position may be closed on-chain already
          }
        }),
      );
      setPnls(results);
    } catch {
      // no-op
    } finally {
      setPnlLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPrices();
    void loadPositions();
    const id = setInterval(() => void loadPrices(true), 30_000);
    return () => clearInterval(id);
  }, [loadPrices, loadPositions]);

  // Re-load positions every time the tab gains focus (e.g. back from bundleTrade)
  useFocusEffect(
    useCallback(() => {
      void loadPositions();
    }, [loadPositions]),
  );

  // ── Close position ───────────────────────────────────────────────────────

  const handleClosePosition = useCallback((pos: StoredPosition) => {
    setNotice({
      title: 'Close Position',
      message: `Close Position #${pos.positionId} on "${getBasket(pos.basketId)?.name ?? pos.basketId}"?\n\nThis will realise your P&L and return collateral to your wallet.`,
      tone: 'info',
      actions: [
        { label: 'Cancel', style: 'secondary' },
        {
          label: 'Close Position',
          style: 'danger',
          onPress: async () => {
            setClosingId(pos.positionId);
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            try {
              const priceMap = await dartRouterService.getOraclePrices(pos.asaIds);
              const oracleIds = Array.from(priceMap.keys());
              const oraclePrices = oracleIds.map((id) => priceMap.get(id)!);
              await crescaBucketService.updateOracle(oracleIds, oraclePrices);

              const { txId, pnlAlgo } = await crescaBucketService.closePosition(
                pos.positionId,
                pos.bucketId,
                pos.asaIds,
              );

              await positionStore.remove(pos.positionId);
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

              const pnlNum = parseFloat(pnlAlgo);
              const sign = pnlNum >= 0 ? '+' : '';
              setNotice({
                title: pnlNum >= 0 ? 'Position Closed — Profit' : 'Position Closed — Loss',
                message: `Realized P&L: ${sign}${pnlAlgo} ALGO\n\nCollateral has been returned to your wallet.`,
                tone: pnlNum >= 0 ? 'success' : 'error',
                actions: [
                  { label: 'View Tx', style: 'secondary', onPress: () => Linking.openURL(`https://lora.algokit.io/testnet/transaction/${txId}`) },
                  { label: 'Done', style: 'primary' },
                ],
              });

              void loadPositions();
            } catch (e: any) {
              setNotice({
                title: 'Close Failed',
                message: e?.message ?? 'Could not close position. Try again.',
                tone: 'error',
              });
            } finally {
              setClosingId(null);
            }
          },
        },
      ],
    });
  }, [loadPositions]);

  // ── Open bundle ──────────────────────────────────────────────────────────

  const handleOpen = (basket: Basket) => {
    void Haptics.selectionAsync();
    router.push({ pathname: '/bundleTrade', params: { basketId: basket.id } });
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <ScreenContainer style={styles.container}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Bundle Trading</Text>
          <Text style={styles.subtitle}>5 curated baskets · Leveraged · Algorand testnet</Text>
        </View>
        {refreshing
          ? <ActivityIndicator size="small" color={Colors.steel} />
          : (
            <TouchableOpacity
              onPress={() => void loadPrices(true)}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Refresh prices"
            >
              <Ionicons name="refresh" size={18} color={Colors.steel} />
            </TouchableOpacity>
          )
        }
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Open Positions section ── */}
        {positions.length > 0 && (
          <View style={styles.posSection}>
            {/* Section header */}
            <View style={styles.posSectionHead}>
              <View style={styles.posPulse} />
              <Text style={styles.posSectionTitle}>Open Positions</Text>
              <Text style={styles.posSectionCount}>{positions.length}</Text>
            </View>

            {positions.map((pos) => (
              <View key={pos.positionId} style={styles.posCardWrap}>
                {closingId === pos.positionId
                  ? (
                    <View style={[styles.posCard, styles.posCardClosing]}>
                      <ActivityIndicator size="small" color={Colors.loss} />
                      <Text style={styles.closingText}>Closing position…</Text>
                    </View>
                  )
                  : (
                    <PositionCard
                      position={pos}
                      pnl={pnls[pos.positionId] ?? null}
                      pnlLoading={pnlLoading && !(pos.positionId in pnls)}
                      onClose={() => handleClosePosition(pos)}
                    />
                  )
                }
              </View>
            ))}
          </View>
        )}

        {/* ── Bundle list ── */}
        <View style={styles.bundlesHead}>
          <Text style={styles.bundlesSectionTitle}>All Bundles</Text>
        </View>

        {loading
          ? BASKETS.map((b) => <SkeletonCard key={b.id} />)
          : (
            <Animated.View style={{ opacity: fadeAnim }}>
              {BASKETS.map((basket, i) => (
                <View key={basket.id} style={i < BASKETS.length - 1 ? styles.cardGap : undefined}>
                  <BundleCard
                    basket={basket}
                    prices={prices}
                    onPress={() => handleOpen(basket)}
                  />
                </View>
              ))}
            </Animated.View>
          )
        }

        <Text style={styles.footer}>
          Prices from Pyth Network · Executes on Algorand testnet
        </Text>
      </ScrollView>

      <AppNoticeModal
        visible={!!notice}
        title={notice?.title ?? ''}
        message={notice?.message ?? ''}
        tone={notice?.tone ?? 'info'}
        actions={notice?.actions}
        onClose={() => setNotice(null)}
      />

    </ScreenContainer>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.screen },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title:    { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.text.primary },
  subtitle: { fontSize: Typography.xs, color: Colors.text.muted, marginTop: 2 },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
  cardGap: { marginBottom: Spacing.lg },

  // ── Open Positions section ──
  posSection: {
    marginBottom: Spacing.xl,
  },
  posSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.md,
  },
  posPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.gain,
  },
  posSectionTitle: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.text.primary,
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  posSectionCount: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.gain,
    backgroundColor: Colors.gainBg + '44',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  posCardWrap: { marginBottom: Spacing.md },

  posCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.card,
  },
  posCardClosing: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
    opacity: 0.7,
  },
  closingText: { fontSize: Typography.sm, color: Colors.loss },

  posAccent: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 3,
    borderTopLeftRadius: Radius.xl,
    borderBottomLeftRadius: Radius.xl,
  },
  posHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  posName: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.text.primary,
  },
  posMeta: {
    fontSize: Typography.xs,
    color: Colors.text.muted,
    marginTop: 2,
  },
  levBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  levBadgeText: { fontSize: Typography.xs, fontWeight: Typography.bold },

  posDivider: { height: 1, backgroundColor: Colors.divider, marginHorizontal: Spacing.lg },

  pnlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  pnlLabel: { fontSize: Typography.xs, color: Colors.text.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  pnlValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pnlValue:    { fontSize: Typography.lg, fontWeight: Typography.bold },
  pnlSkeleton: { width: 120, height: 22, borderRadius: Radius.sm, backgroundColor: Colors.bg.subtle },
  pnlPctBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  pnlPctText:  { fontSize: Typography.xs, fontWeight: Typography.bold },

  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.lossBg + '33',
    borderWidth: 1,
    borderColor: Colors.loss + '55',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  closeBtnText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.loss },

  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  txText: { fontSize: 10, color: Colors.text.muted },

  // ── All Bundles label ──
  bundlesHead: { marginBottom: Spacing.md },
  bundlesSectionTitle: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.steel,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // ── Bundle card ──
  card: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.card,
  },
  cardAccent: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 3,
    borderTopLeftRadius: Radius.xl,
    borderBottomLeftRadius: Radius.xl,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  iconWrap: {
    width: 40, height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    backgroundColor: Colors.bg.subtle,
    justifyContent: 'center', alignItems: 'center',
  },
  cardTitleCol: { flex: 1 },
  cardName:     { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.text.primary },
  cardDesc:     { fontSize: Typography.xs, color: Colors.text.muted, marginTop: 2 },
  riskBadge: {
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full,
  },
  riskText: { fontSize: Typography.xs, fontWeight: Typography.bold },

  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.bg.subtle,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSymbol: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.text.primary },
  chipPct:    { fontSize: Typography.xs, color: Colors.text.muted },

  divider: { height: 1, backgroundColor: Colors.divider, marginHorizontal: Spacing.lg },

  pricesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: 4,
  },
  priceCell: {
    width: '48%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.bg.subtle,
    borderRadius: Radius.sm,
  },
  priceSym: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.text.secondary },
  priceVal: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.text.primary },

  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  ctaLabel: { fontSize: Typography.sm, fontWeight: Typography.bold },

  footer: {
    textAlign: 'center',
    fontSize: Typography.xs,
    color: Colors.text.muted,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },

  // ── Skeletons ──
  skelHead:  { height: 40, borderRadius: Radius.md, backgroundColor: Colors.bg.subtle, margin: Spacing.lg, marginBottom: Spacing.sm },
  skelDesc:  { height: 14, borderRadius: Radius.sm, backgroundColor: Colors.bg.subtle, marginHorizontal: Spacing.lg, marginBottom: Spacing.md, width: '60%' },
  skelRow:   { flexDirection: 'row', gap: 6, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  skelChip:  { height: 26, borderRadius: Radius.full, backgroundColor: Colors.bg.subtle },
  skelGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  skelPrice: { width: '48%', height: 30, borderRadius: Radius.sm, backgroundColor: Colors.bg.subtle },
  skelCta:   { height: 20, borderRadius: Radius.sm, backgroundColor: Colors.bg.subtle, margin: Spacing.lg, marginTop: Spacing.sm, width: '40%', alignSelf: 'flex-end' },
});
