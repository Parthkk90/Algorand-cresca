import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppNoticeAction, AppNoticeModal } from '../components/AppNoticeModal';
import { ScreenContainer } from '../components/ScreenContainer';
import { HapticButton } from '../components/HapticButton';
import { InlineError } from '../components/InlineError';
import { TxSuccessCard } from '../components/TxSuccessCard';
import { BASKETS, Basket, basketToContractArgs, getBasket } from '../constants/baskets';
import { Colors, Radius, Shadow, Spacing, Typography } from '../constants/theme';
import { algorandService } from '../services/algorandService';
import { crescaBucketService } from '../services/algorandContractServices';
import { dartRouterService } from '../services/dartRouterService';
import { pythOracleService } from '../services/pythOracleService';
import { positionStore } from '../services/positionStore';

// ─── helpers ────────────────────────────────────────────────────────────────

function formatUSD(price: number): string {
  if (price >= 10_000) return `$${Math.round(price).toLocaleString()}`;
  if (price >= 100)    return `$${price.toFixed(0)}`;
  if (price >= 1)      return `$${price.toFixed(2)}`;
  return `$${price.toFixed(3)}`;
}

function normalizeAlgoInput(raw: string): string {
  const replaced = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const firstDot = replaced.indexOf('.');
  const compact = firstDot === -1
    ? replaced
    : `${replaced.slice(0, firstDot + 1)}${replaced.slice(firstDot + 1).replace(/\./g, '')}`;

  const [intPart, decPart] = compact.split('.');
  if (decPart === undefined) return intPart;
  return `${intPart}.${decPart.slice(0, 6)}`; // microALGO precision
}

function parseAlgoAmount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ─── screen ─────────────────────────────────────────────────────────────────

export default function BundleTradeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const basket: Basket =
    getBasket(params.basketId as string) ??
    getBasket(params.bundleId  as string) ??
    BASKETS[0];

  const { asaIds, weights } = basketToContractArgs(basket);
  const symbols = basket.assets.map((a) => a.symbol);

  const [balance,     setBalance]     = useState('0.000');
  const [amount,      setAmount]      = useState('');
  const [leverage,    setLeverage]    = useState(5);
  const [direction,   setDirection]   = useState<'long' | 'short'>('long');
  const [busy,        setBusy]        = useState(true);
  const [bucketId,    setBucketId]    = useState<number | null>(null);
  const [oracleAlive, setOracleAlive] = useState<boolean | null>(null);

  // USD prices for display
  const [usdPrices,   setUsdPrices]   = useState<Record<string, number>>({});
  // ALGO-denom prices for the contract
  const [algoPrices,  setAlgoPrices]  = useState<Map<number, number>>(new Map());

  const [tradeError,  setTradeError]  = useState('');
  const [lastTradeTxId, setLastTradeTxId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ title: string; message: string; actions?: AppNoticeAction[] } | null>(null);
  const sliderWidthRef = React.useRef(1);

  const setLeverageFromX = (x: number) => {
    const width = Math.max(1, sliderWidthRef.current);
    const clamped = Math.max(0, Math.min(x, width));
    const normalized = clamped / width;
    const value = Math.round(normalized * 40); // 0x..40x
    setLeverage(value);
  };

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        setLeverageFromX(evt.nativeEvent.locationX);
      },
      onPanResponderMove: (evt) => {
        setLeverageFromX(evt.nativeEvent.locationX);
      },
      onPanResponderRelease: () => {
        void Haptics.selectionAsync();
      },
    }),
  ).current;

  useEffect(() => {
    void init();
  }, []);

  const init = async () => {
    try {
      await algorandService.initializeWallet();
      const bal = await algorandService.getBalance();
      setBalance(Number(bal.algo).toFixed(3));

      // Fetch display prices (USD) and contract prices (ALGO-denom) in parallel
      const [usdResult, algoResult] = await Promise.all([
        pythOracleService.getPrices(symbols),
        dartRouterService.getOraclePrices(asaIds),
      ]);

      const usd: Record<string, number> = {};
      Object.entries(usdResult).forEach(([s, p]) => { usd[s] = p.price; });
      setUsdPrices(usd);
      setAlgoPrices(algoResult);
      setOracleAlive(Object.keys(usd).length > 0 && algoResult.size > 0);
    } catch {
      setOracleAlive(false);
    } finally {
      setBusy(false);
    }
  };

  const parsedMargin = parseAlgoAmount(amount);
  const exposure = parsedMargin * leverage;

  const handleOpen = async () => {
    setTradeError('');
    setLastTradeTxId(null);
    const amt = parseAlgoAmount(amount);

    if (amt <= 0) {
      setTradeError('Enter a positive ALGO amount.');
      return;
    }
    if (leverage < 1) {
      setTradeError('Set leverage above 0x to execute a trade.');
      return;
    }
    if (amt > parseAlgoAmount(balance)) {
      setTradeError('Amount exceeds your ALGO balance.');
      return;
    }
    if (oracleAlive === false) {
      setTradeError('Oracle not ready — tap Refresh then try again.');
      return;
    }

    try {
      setBusy(true);

      const oraclePriceMap = await dartRouterService.getOraclePrices(asaIds);
      const oracleIds    = Array.from(oraclePriceMap.keys());
      const oraclePrices = oracleIds.map((id) => oraclePriceMap.get(id)!);
      await crescaBucketService.updateOracle(oracleIds, oraclePrices);

      await crescaBucketService.depositCollateral(amt);

      let id = bucketId;
      if (id === null) {
        const result = await crescaBucketService.createBucket(asaIds, weights, leverage);
        id = result.bucketId;
        setBucketId(id);
      }

      const opened = await crescaBucketService.openPosition(id, direction === 'long', amt, asaIds);
      const url = `https://lora.algokit.io/testnet/transaction/${opened.txId}`;
      setLastTradeTxId(opened.txId);

      // Persist the position so bucket.tsx can show P&L + close
      await positionStore.add({
        positionId: opened.positionId,
        bucketId:   id,
        basketId:   basket.id,
        asaIds,
        leverage,
        marginAlgo: amt,
        openedAt:   Date.now(),
        txId:       opened.txId,
      });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setNotice({
        title: 'Position Opened',
        message: `${direction.toUpperCase()} position #${opened.positionId} opened on "${basket.name}" with ${leverage}x leverage.\nTx: ${opened.txId.slice(0, 8)}...${opened.txId.slice(-6)}\n\nYou can open the explorer link below or from this dialog.`,
        actions: [
          { label: 'View Tx', style: 'secondary', onPress: () => Linking.openURL(url) },
          { label: 'Stay', style: 'secondary' },
          { label: 'Back', style: 'primary', onPress: () => router.back() },
        ],
      });

      setAmount('');
      const bal = await algorandService.getBalance();
      setBalance(Number(bal.algo).toFixed(3));
    } catch (e: any) {
      setTradeError(e?.message || 'Could not open position.');
    } finally {
      setBusy(false);
    }
  };

  if (busy && usdPrices && Object.keys(usdPrices).length === 0) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.navy} />
      </View>
    );
  }

  const canTrade =
    !busy &&
    parsedMargin > 0 &&
    parsedMargin <= parseAlgoAmount(balance) &&
    leverage >= 1 &&
    oracleAlive !== false;
  const sliderPosition = (leverage / 40) * 100;

  return (
    <ScreenContainer style={styles.container} bottomInset={false}>

      {/* ── Navigation header ── */}
      <View style={styles.navBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.navy} />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>{basket.name}</Text>
        <TouchableOpacity
          onPress={() => void init()}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Refresh prices"
        >
          <Ionicons name="refresh-outline" size={20} color={Colors.steel} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Bundle overview card ── */}
        <View style={styles.overviewCard}>
          <Text style={styles.overviewDesc}>{basket.description}</Text>

          {/* Asset composition + live USD prices */}
          <View style={styles.pricesTable}>
            {basket.assets.map((a, i) => {
              const usd = usdPrices[a.symbol];
              const isLast = i === basket.assets.length - 1;
              return (
                <View
                  key={a.asaId}
                  style={[styles.priceRow, !isLast && styles.priceRowBorder]}
                >
                  <View style={styles.priceLeft}>
                    <Text style={styles.priceSym}>{a.symbol}</Text>
                    <View style={styles.weightPill}>
                      <Text style={styles.weightPillText}>{a.weight}%</Text>
                    </View>
                  </View>
                  <Text style={[styles.priceUSD, { fontVariant: ['tabular-nums'] }]}>
                    {usd != null ? formatUSD(usd) : busy ? '…' : '—'}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Oracle status */}
          <View style={styles.oracleRow}>
            <View style={[
              styles.oracleDot,
              { backgroundColor: oracleAlive === false ? Colors.loss : oracleAlive === true ? Colors.gain : Colors.steel },
            ]} />
            <Text style={styles.oracleText}>
              {oracleAlive === false
                ? 'Oracle unavailable — tap refresh'
                : oracleAlive === true
                ? 'Oracle synced · Pyth Network'
                : 'Loading oracle…'}
            </Text>
          </View>
        </View>

        {/* ── Margin input (compact) ── */}
        <View style={styles.marginCard}>
          <Text style={styles.sectionLabel}>Margin</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={amount}
              onChangeText={(v) => { setAmount(normalizeAlgoInput(v)); setTradeError(''); }}
              keyboardType="decimal-pad"
              placeholder="0.0"
              placeholderTextColor={Colors.text.muted}
              style={styles.input}
              accessibilityLabel="Enter margin amount in ALGO"
            />
            <View style={styles.inputCurrency}>
              <Text style={styles.currencyText}>ALGO</Text>
            </View>
          </View>
          <Text style={styles.hint}>Available: {balance} ALGO</Text>
          <TouchableOpacity
            style={styles.maxBtn}
            onPress={() => {
              setAmount(balance);
              setTradeError('');
              void Haptics.selectionAsync();
            }}
            accessibilityRole="button"
            accessibilityLabel="Use max available margin"
          >
            <Text style={styles.maxBtnText}>Use Max</Text>
          </TouchableOpacity>
        </View>

        {/* ── Direction ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Direction</Text>
          <View style={styles.directionRow}>
            <TouchableOpacity
              style={[styles.directionBtn, direction === 'long' && styles.directionBtnLongActive]}
              onPress={() => {
                setDirection('long');
                void Haptics.selectionAsync();
              }}
            >
              <Ionicons name="trending-up" size={16} color={Colors.white} />
              <Text style={styles.dirText}>Long</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.directionBtn, direction === 'short' && styles.directionBtnShortActive]}
              onPress={() => {
                setDirection('short');
                void Haptics.selectionAsync();
              }}
            >
              <Ionicons name="trending-down" size={16} color={Colors.white} />
              <Text style={styles.dirText}>Short</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Leverage (drag slider) ── */}
        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionLabel}>Leverage</Text>
            <Text style={styles.levValue}>{leverage}x</Text>
          </View>
          <View
            style={styles.sliderTrack}
            onLayout={(e) => {
              sliderWidthRef.current = e.nativeEvent.layout.width;
            }}
            {...panResponder.panHandlers}
          >
            <View style={[styles.sliderFill, { width: `${sliderPosition}%` }]} />
            <View style={[styles.sliderThumb, { left: `${sliderPosition}%` }]} />
          </View>
          <View style={styles.sliderLabels}>
            <Text style={styles.hint}>0x</Text>
            <Text style={styles.hint}>40x</Text>
          </View>
        </View>

        <InlineError message={tradeError} />

        {/* ── Execute (directly below leverage) ── */}
        <HapticButton
          style={canTrade ? styles.cta : { ...styles.cta, ...styles.ctaDisabled }}
          onPress={handleOpen}
          disabled={!canTrade}
          hapticStyle={Haptics.ImpactFeedbackStyle.Heavy}
          accessibilityLabel={`Execute ${direction} trade with ${leverage}x leverage on ${basket.name}`}
        >
          {busy
            ? <ActivityIndicator size="small" color={Colors.white} />
            : (
              <>
                <Ionicons name="flash" size={18} color={Colors.white} />
                <Text style={styles.ctaText}>Execute Trade</Text>
              </>
            )
          }
        </HapticButton>

        {lastTradeTxId ? (
          <TxSuccessCard
            txId={lastTradeTxId}
            onDismiss={() => setLastTradeTxId(null)}
          />
        ) : null}

        {/* ── Order summary ── */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Order Summary</Text>
          {[
            { label: 'Bundle',     value: basket.name },
            { label: 'Margin',     value: `${parsedMargin.toFixed(3)} ALGO` },
            { label: 'Leverage',   value: `${leverage}x` },
            { label: 'Direction',  value: direction.toUpperCase(), highlight: true },
          ].map(({ label, value, highlight }) => (
            <View key={label} style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{label}</Text>
              <Text style={[styles.summaryValue, highlight && styles.highlightValue]}>{value}</Text>
            </View>
          ))}
          <View style={[styles.summaryRow, styles.summaryTotalRow]}>
            <Text style={styles.totalLabel}>Total Exposure</Text>
            <Text style={[styles.totalValue, { fontVariant: ['tabular-nums'] }]}>
              {exposure.toFixed(2)} ALGO
            </Text>
          </View>
        </View>

        {/* ── Risk notice ── */}
        <View style={styles.riskNotice}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.steel} />
          <Text style={styles.riskText}>
            Leveraged positions may result in losses exceeding your margin. Testnet only.
          </Text>
        </View>

        <Text style={styles.flowHint}>
          Update Oracle → Deposit → Create Bucket → Open Position
        </Text>
      </ScrollView>

      <AppNoticeModal
        visible={!!notice}
        title={notice?.title ?? ''}
        message={notice?.message ?? ''}
        tone="success"
        actions={notice?.actions}
        onClose={() => setNotice(null)}
      />

    </ScreenContainer>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.screen },
  loading:   { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg.screen },

  // Nav
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  backBtn:  { width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: Colors.bg.subtle, justifyContent: 'center', alignItems: 'center' },
  navTitle: { flex: 1, textAlign: 'center', fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.text.primary, marginHorizontal: Spacing.md },

  content: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: 120 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // Overview card
  overviewCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.card,
  },
  overviewDesc: {
    fontSize: Typography.sm,
    color: Colors.text.secondary,
    lineHeight: 20,
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  pricesTable: {
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    marginHorizontal: Spacing.lg,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  priceRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  priceLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceSym:   { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.text.primary, width: 42 },
  weightPill: { backgroundColor: Colors.bg.subtle, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  weightPillText: { fontSize: Typography.xs, color: Colors.text.muted, fontWeight: Typography.medium },
  priceUSD:   { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.navy },

  oracleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: Spacing.lg,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  oracleDot:  { width: 8, height: 8, borderRadius: 4 },
  oracleText: { fontSize: Typography.xs, color: Colors.text.muted, flex: 1 },

  // Section
  section:      { gap: Spacing.sm },
  sectionLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.steel, textTransform: 'uppercase', letterSpacing: 0.8 },
  levValue:     { color: Colors.navy, fontSize: Typography.base, fontWeight: Typography.bold },

  // Input (compact margin card)
  marginCard: {
    gap: 8,
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 64,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: Colors.text.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 0,
  },
  inputCurrency: {
    paddingHorizontal: Spacing.lg,
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  currencyText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.steel },
  hint:         { fontSize: Typography.xs, color: Colors.text.muted },
  maxBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg.subtle,
  },
  maxBtnText: { fontSize: Typography.xs, color: Colors.text.secondary, fontWeight: Typography.semibold },

  // Leverage slider
  sliderTrack: {
    height: 30,
    borderRadius: Radius.full,
    backgroundColor: Colors.bg.subtle,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#2E4D6B',
  },
  sliderThumb: {
    position: 'absolute',
    marginLeft: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.navy,
    borderWidth: 2,
    borderColor: Colors.bg.screen,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  // Direction
  directionRow: { flexDirection: 'row', gap: Spacing.sm },
  directionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg.subtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  directionBtnLongActive: { backgroundColor: Colors.gainBg, borderColor: Colors.gain },
  directionBtnShortActive: { backgroundColor: Colors.lossBg, borderColor: Colors.loss },
  dirText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.white },

  // Summary
  summaryCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: 10,
    ...Shadow.subtle,
  },
  summaryTitle:    { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.text.primary, marginBottom: 4 },
  summaryRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel:    { fontSize: Typography.sm, color: Colors.text.muted },
  summaryValue:    { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.text.primary },
  highlightValue:  { color: Colors.gain },
  summaryTotalRow: { marginTop: 4, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.divider },
  totalLabel:      { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.text.primary },
  totalValue:      { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.navy },

  // Risk notice
  riskNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: Spacing.md,
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  riskText: { flex: 1, fontSize: Typography.xs, color: Colors.steel, lineHeight: 18 },

  // CTA
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: Radius.lg,
    backgroundColor: Colors.navy,
    ...Shadow.card,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText:     { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.white },

  flowHint: {
    fontSize: Typography.xs,
    color: Colors.text.muted,
    textAlign: 'center',
    marginTop: -Spacing.sm,
  },
});
