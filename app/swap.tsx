import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Easing,
    Linking,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { AppNoticeAction, AppNoticeModal, AppNoticeTone } from '../components/AppNoticeModal';
import { ScreenContainer } from '../components/ScreenContainer';
import { Colors, Typography, Spacing, Radius, Shadow } from '../constants/theme';
import { algorandService } from '../services/algorandService';
import { dartRouterService, SwapQuote } from '../services/dartRouterService';
import { pythOracleService } from '../services/pythOracleService';
import { SYNTHETIC_ASA_IDS } from '../constants/baskets';
import { StoredSwapAsset, swapPortfolioStore } from '../services/swapPortfolioStore';

// ---------------------------------------------------------------------------
// Token definitions — Algorand testnet ASAs supported in the swap UI
// ---------------------------------------------------------------------------

interface Token {
  symbol:   string;
  name:     string;
  icon:     keyof typeof Ionicons.glyphMap;
  color:    string;
  asaId:    number;
  decimals: number;
}

const AVAILABLE_TOKENS: Token[] = [
  { symbol: 'ALGO', name: 'Algorand',  icon: 'logo-electron', color: Colors.obsidian.primary, asaId: 0,        decimals: 6 },
  { symbol: 'TST',  name: 'Cresca Test Asset', icon: 'flask-outline', color: Colors.obsidian.primary, asaId: 758849338, decimals: 6 },
  { symbol: 'USDC', name: 'USD Coin',  icon: 'cash',          color: Colors.obsidian.tertiary, asaId: 10458941, decimals: 6 },
  { symbol: 'BTC',  name: 'Bitcoin',   icon: 'logo-bitcoin',  color: Colors.obsidian.primary,  asaId: SYNTHETIC_ASA_IDS.BTC,  decimals: 6 },
  { symbol: 'ETH',  name: 'Ethereum',  icon: 'diamond-outline', color: Colors.obsidian.tertiary, asaId: SYNTHETIC_ASA_IDS.ETH, decimals: 6 },
  { symbol: 'SOL',  name: 'Solana',    icon: 'flash-outline', color: Colors.obsidian.tertiary, asaId: SYNTHETIC_ASA_IDS.SOL, decimals: 6 },
  { symbol: 'ADA',  name: 'Cardano',   icon: 'pulse-outline', color: Colors.obsidian.tertiary, asaId: SYNTHETIC_ASA_IDS.ADA, decimals: 6 },
  { symbol: 'XRP',  name: 'XRP',       icon: 'swap-horizontal-outline', color: Colors.obsidian.primary, asaId: SYNTHETIC_ASA_IDS.XRP, decimals: 6 },
  { symbol: 'SUI',  name: 'Sui',       icon: 'layers-outline', color: Colors.obsidian.tertiary, asaId: SYNTHETIC_ASA_IDS.SUI, decimals: 6 },
  { symbol: 'APT',  name: 'Aptos',     icon: 'git-network-outline', color: Colors.obsidian.tertiary, asaId: SYNTHETIC_ASA_IDS.APT, decimals: 6 },
  { symbol: 'NEAR', name: 'Near',      icon: 'planet-outline', color: Colors.obsidian.primary, asaId: SYNTHETIC_ASA_IDS.NEAR, decimals: 6 },
  { symbol: 'AVAX', name: 'Avalanche', icon: 'flame-outline', color: Colors.obsidian.tertiary, asaId: SYNTHETIC_ASA_IDS.AVAX, decimals: 6 },
  { symbol: 'MOVE', name: 'Movement',  icon: 'trending-up-outline', color: Colors.obsidian.tertiary, asaId: SYNTHETIC_ASA_IDS.MOVE, decimals: 6 },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SwapScreen() {
  const router = useRouter();

  const [walletAddress,     setWalletAddress]     = useState('');
  const [balance,           setBalance]           = useState('0.000');
  const [isLoading,         setIsLoading]         = useState(true);
  const [fromToken,         setFromToken]         = useState<Token>(AVAILABLE_TOKENS[0]);
  const [toToken,           setToToken]           = useState<Token>(AVAILABLE_TOKENS[1]);
  const [fromAmount,        setFromAmount]        = useState('');
  const [toAmount,          setToAmount]          = useState('');
  const [showFromModal,     setShowFromModal]     = useState(false);
  const [showToModal,       setShowToModal]       = useState(false);
  const [isSwapping,        setIsSwapping]        = useState(false);
  const [isFetchingQuote,   setIsFetchingQuote]   = useState(false);
  const [quoteError,        setQuoteError]        = useState<string | null>(null);
  const [portfolioAssets,   setPortfolioAssets]   = useState<StoredSwapAsset[]>([]);

  // Live quote state
  const [currentQuote,      setCurrentQuote]      = useState<SwapQuote | null>(null);
  const [priceImpact,       setPriceImpact]       = useState<number | null>(null);
  const [routeText,         setRouteText]         = useState<string | null>(null);
  const [dartSavingsPct,    setDartSavingsPct]    = useState<number | null>(null);
  const [notice,            setNotice]            = useState<{
    title: string;
    message: string;
    tone: AppNoticeTone;
    actions?: AppNoticeAction[];
  } | null>(null);

  // Debounce timer ref
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  useEffect(() => {
    initializeWallet();
  }, []);

  // Re-fetch quote when tokens or amount changes (debounced 600 ms)
  useEffect(() => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      setToAmount('');
      setCurrentQuote(null);
      setPriceImpact(null);
      setRouteText(null);
      setDartSavingsPct(null);
      return;
    }
    quoteTimer.current = setTimeout(() => loadLiveQuote(), 600);
    return () => {
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
    };
  }, [fromAmount, fromToken, toToken]);

  const initializeWallet = async () => {
    try {
      const walletData = await algorandService.initializeWallet();
      setWalletAddress(walletData.address);
      const { algo } = await algorandService.getBalance();
      setBalance(parseFloat(algo).toFixed(3));
      const stored = await swapPortfolioStore.getAll(walletData.address);
      setPortfolioAssets(stored);
    } catch (err) {
      console.error('Error initialising Algorand wallet:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshPortfolio = async (address?: string) => {
    const addr = address ?? walletAddress;
    if (!addr) return;
    const stored = await swapPortfolioStore.getAll(addr);
    setPortfolioAssets(stored);
  };

  // ---------------------------------------------------------------------------
  // Live quote
  // ---------------------------------------------------------------------------

  const loadLiveQuote = async () => {
    const amount = parseFloat(fromAmount);
    if (!amount || amount <= 0) return;
    if (fromToken.asaId === toToken.asaId) return;

    setIsFetchingQuote(true);
    setQuoteError(null);
    try {
      const amountBase = Math.round(amount * Math.pow(10, fromToken.decimals));
      const quote = await dartRouterService.fetchQuote(fromToken.asaId, toToken.asaId, amountBase);

      const outputAmount = quote.quote / Math.pow(10, toToken.decimals);
      setToAmount(outputAmount.toFixed(toToken.decimals));
      setCurrentQuote(quote);
      setPriceImpact(quote.userPriceImpact);
      setRouteText(dartRouterService.formatRoute(quote));

      const { savingsPct } = dartRouterService.getDartSavings(quote);
      setDartSavingsPct(savingsPct > 0.001 ? savingsPct : null);
    } catch (err: any) {
      const message = String(err?.message ?? 'Failed to fetch swap quote');
      console.warn('Quote fetch failed:', message);
      setQuoteError(message);

      // Fallback: show an estimate from oracle prices so UI remains responsive.
      try {
        const fromUsd = fromToken.symbol === 'USDC'
          ? 1
          : (await pythOracleService.getPrice(fromToken.symbol))?.price;
        const toUsd = toToken.symbol === 'USDC'
          ? 1
          : (await pythOracleService.getPrice(toToken.symbol))?.price;

        if (fromUsd && toUsd && fromUsd > 0 && toUsd > 0) {
          const estimated = (amount * fromUsd) / toUsd;
          setToAmount(estimated.toFixed(toToken.decimals));
          setRouteText('Estimated from oracle prices');
        } else {
          setToAmount('');
          setRouteText(null);
        }
      } catch {
        setToAmount('');
        setRouteText(null);
      }

      setCurrentQuote(null);
      setPriceImpact(null);
      setDartSavingsPct(null);
    } finally {
      setIsFetchingQuote(false);
    }
  };

  const showNotice = (
    title: string,
    message: string,
    tone: AppNoticeTone = 'info',
    actions?: AppNoticeAction[],
  ) => {
    setNotice({ title, message, tone, actions });
  };

  // ---------------------------------------------------------------------------
  // Token swap direction
  // ---------------------------------------------------------------------------

  const handleSwapTokens = () => {
    const tmp = fromToken;
    setFromToken(toToken);
    setToToken(tmp);
    setFromAmount('');
    setToAmount('');
    setCurrentQuote(null);
    setQuoteError(null);
  };

  const handleSelectFromToken = (token: Token) => {
    if (token.symbol === toToken.symbol) {
      setFromToken(token);
      setToToken(fromToken);
    } else {
      setFromToken(token);
    }
    setShowFromModal(false);
    setFromAmount('');
    setToAmount('');
    setQuoteError(null);
  };

  const handleSelectToToken = (token: Token) => {
    if (token.symbol === fromToken.symbol) {
      setToToken(token);
      setFromToken(toToken);
    } else {
      setToToken(token);
    }
    setShowToModal(false);
    setFromAmount('');
    setToAmount('');
    setQuoteError(null);
  };

  // ---------------------------------------------------------------------------
  // Swap execution
  // ---------------------------------------------------------------------------

  const handlePreviewSwap = async () => {
    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      showNotice('Invalid Amount', 'Please enter a valid amount.', 'error');
      return;
    }
    if (fromToken.asaId === 0 && parseFloat(fromAmount) > parseFloat(balance)) {
      showNotice('Insufficient Balance', 'Insufficient ALGO balance.', 'error');
      return;
    }
    if (!currentQuote) {
      showNotice('Quote Not Ready', 'Please wait a moment and try again.', 'error');
      return;
    }

    const impact  = (currentQuote.userPriceImpact).toFixed(2);
    const savings = dartSavingsPct != null ? `\nSavings: +${dartSavingsPct.toFixed(3)}% vs best single venue` : '';
    const route   = routeText ? `\nRoute: ${routeText}` : '';

    const routeName = currentQuote.route?.[0]?.path?.[0]?.name ?? '';
    if (routeName === 'oracle-estimate') {
      showNotice(
        'Estimate Ready',
        `Estimated ${toToken.symbol} output: ${toAmount}\n\nYou can store this swap in-app now (local portfolio record).`,
        'info',
        [
          { label: 'Cancel', style: 'secondary' },
          { label: 'Store In App', style: 'primary', onPress: () => void handleStoreSwapInApp() },
        ],
      );
      return;
    }

    showNotice(
      'Swap Preview',
      `Swap ${fromAmount} ${fromToken.symbol}\nFor ≥ ${toAmount} ${toToken.symbol}\n\nPrice Impact: ${impact}%${route}${savings}`,
      'info',
      [
        { label: 'Cancel', style: 'secondary' },
        { label: 'Execute Swap', style: 'primary', onPress: () => void handleExecuteSwap() },
      ],
    );
  };

  const handleExecuteSwap = async () => {
    if (!currentQuote) return;
    try {
      setIsSwapping(true);
      const { txId } = await dartRouterService.executeSwap(currentQuote, 0.5);
      const explorerUrl = `https://lora.algokit.io/testnet/transaction/${txId}`;

      showNotice(
        'Swap Successful',
        `Swapped ${fromAmount} ${fromToken.symbol} for ${toAmount} ${toToken.symbol}`,
        'success',
        [
          { label: 'View on Explorer', style: 'secondary', onPress: () => Linking.openURL(explorerUrl) },
          { label: 'Done', style: 'primary', onPress: () => router.back() },
        ],
      );

      setFromAmount('');
      setToAmount('');
      setCurrentQuote(null);

      await swapPortfolioStore.applySwap(
        walletAddress,
        {
          symbol: fromToken.symbol,
          asaId: fromToken.asaId,
          amount: parseFloat(fromAmount),
        },
        {
          symbol: toToken.symbol,
          asaId: toToken.asaId,
          amount: parseFloat(toAmount),
        },
      );
      await refreshPortfolio();

      const { algo } = await algorandService.getBalance();
      setBalance(parseFloat(algo).toFixed(3));
    } catch (err: any) {
      showNotice('Swap Failed', err.message || 'Unknown error', 'error');
    } finally {
      setIsSwapping(false);
    }
  };

  const handleStoreSwapInApp = async () => {
    const from = parseFloat(fromAmount);
    const to = parseFloat(toAmount);
    if (!walletAddress || !Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0) {
      showNotice('Invalid Amount', 'Invalid swap amount for storage.', 'error');
      return;
    }

    if (fromToken.asaId !== 0) {
      const current = await swapPortfolioStore.getAmount(walletAddress, fromToken.symbol);
      if (current < from) {
        showNotice('Insufficient Stored Balance', `You only have ${current.toFixed(6)} ${fromToken.symbol} in app storage.`, 'error');
        return;
      }
    }

    await swapPortfolioStore.applySwap(
      walletAddress,
      { symbol: fromToken.symbol, asaId: fromToken.asaId, amount: from },
      { symbol: toToken.symbol, asaId: toToken.asaId, amount: to },
    );
    await refreshPortfolio();

    showNotice('Stored', `${to.toFixed(6)} ${toToken.symbol} saved in your app portfolio.`, 'success');
    setFromAmount('');
    setToAmount('');
    setCurrentQuote(null);
  };

  // ---------------------------------------------------------------------------
  // Token selector modal
  // ---------------------------------------------------------------------------

  const renderTokenModal = (isFrom: boolean) => {
    const visible      = isFrom ? showFromModal : showToModal;
    const setVisible   = isFrom ? setShowFromModal : setShowToModal;
    const handleSelect = isFrom ? handleSelectFromToken : handleSelectToToken;
    const selected     = isFrom ? fromToken : toToken;

    return (
      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.tokenModalContent}>
            <View style={styles.tokenModalHandle} />
            <View style={styles.tokenModalHeader}>
              <Text style={styles.tokenModalTitle}>Select Token</Text>
              <TouchableOpacity
                onPress={() => setVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close token selector"
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Ionicons name="close" size={22} color={Colors.steel} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.tokenList} showsVerticalScrollIndicator={false}>
              {AVAILABLE_TOKENS.map((token) => (
                <TouchableOpacity
                  key={token.symbol}
                  style={styles.tokenItem}
                  onPress={() => handleSelect(token)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${token.name}`}
                  accessibilityState={{ selected: token.symbol === selected.symbol }}
                >
                  <View style={[styles.tokenIcon, { backgroundColor: Colors.bg.subtle }]}>
                    <Ionicons name={token.icon} size={22} color={Colors.navy} />
                  </View>
                  <View style={styles.tokenInfo}>
                    <Text style={styles.tokenSymbol}>{token.symbol}</Text>
                    <Text style={styles.tokenName}>{token.name}</Text>
                  </View>
                  {token.symbol === selected.symbol && (
                    <Ionicons name="checkmark-circle" size={22} color={Colors.navy} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  // ---------------------------------------------------------------------------
  // Animations
  // ---------------------------------------------------------------------------

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    if (!isLoading) {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }
  }, [isLoading]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.navy} />
      </View>
    );
  }

  const canSwap = !isSwapping && !isFetchingQuote && !!currentQuote && parseFloat(fromAmount || '0') > 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.navy} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Swap</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* From token */}
          <View style={styles.swapCard}>
            <Text style={styles.cardLabel}>FROM</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.amountInput}
                value={fromAmount}
                onChangeText={setFromAmount}
                placeholder="0.00"
                placeholderTextColor={Colors.sky}
                keyboardType="decimal-pad"
              />
              <TouchableOpacity
                style={styles.tokenSelector}
                onPress={() => setShowFromModal(true)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Select from token, currently ${fromToken.symbol}`}
              >
                <View style={styles.tokenIconSmall}>
                  <Ionicons name={fromToken.icon} size={18} color={Colors.navy} />
                </View>
                <View style={styles.tokenSelectorText}>
                  <Text style={styles.tokenSelectorSymbol}>{fromToken.symbol}</Text>
                  <Text style={styles.tokenSelectorName}>{fromToken.name}</Text>
                </View>
                <Ionicons name="chevron-down" size={16} color={Colors.steel} />
              </TouchableOpacity>
            </View>
            {fromToken.asaId === 0 && (
              <Text style={styles.balanceText}>Balance: {balance} ALGO</Text>
            )}
          </View>

          {/* Swap direction */}
          <View style={styles.swapButtonContainer}>
            <TouchableOpacity
              style={styles.swapIconButton}
              onPress={handleSwapTokens}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Swap token order"
            >
              <Ionicons name="swap-vertical" size={20} color={Colors.navy} />
            </TouchableOpacity>
          </View>

          {/* To token */}
          <View style={styles.swapCard}>
            <Text style={styles.cardLabel}>TO</Text>
            <View style={styles.inputRow}>
              {isFetchingQuote
                ? <ActivityIndicator style={{ flex: 1 }} color={Colors.steel} />
                : (
                  <TextInput
                    style={[styles.amountInput, { color: Colors.steel }]}
                    value={toAmount}
                    placeholder="0.00"
                    placeholderTextColor={Colors.sky}
                    editable={false}
                  />
                )}
              <TouchableOpacity
                style={styles.tokenSelector}
                onPress={() => setShowToModal(true)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Select to token, currently ${toToken.symbol}`}
              >
                <View style={styles.tokenIconSmall}>
                  <Ionicons name={toToken.icon} size={18} color={Colors.navy} />
                </View>
                <View style={styles.tokenSelectorText}>
                  <Text style={styles.tokenSelectorSymbol}>{toToken.symbol}</Text>
                  <Text style={styles.tokenSelectorName}>{toToken.name}</Text>
                </View>
                <Ionicons name="chevron-down" size={16} color={Colors.steel} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Live quote details */}
          {currentQuote && (
            <View style={styles.rateCard}>
              {priceImpact !== null && (
                <View style={styles.rateRow}>
                  <Text style={styles.rateLabel}>Price Impact</Text>
                  <Text style={[styles.rateValue, priceImpact > 2 ? styles.impactHigh : styles.impactLow]}>
                    {priceImpact.toFixed(2)}%
                  </Text>
                </View>
              )}
              {routeText && (
                <View style={styles.rateRow}>
                  <Text style={styles.rateLabel}>Route</Text>
                  <Text style={[styles.rateValue, { maxWidth: '60%', textAlign: 'right' }]}>{routeText}</Text>
                </View>
              )}
              <View style={styles.rateRow}>
                <Text style={styles.rateLabel}>USD Value In</Text>
                <Text style={styles.rateValue}>${currentQuote.usdIn.toFixed(2)}</Text>
              </View>
              <View style={styles.rateRow}>
                <Text style={styles.rateLabel}>USD Value Out</Text>
                <Text style={styles.rateValue}>${currentQuote.usdOut.toFixed(2)}</Text>
              </View>
              {/* Savings badge */}
              {dartSavingsPct !== null && dartSavingsPct > 0 && (
                <View style={styles.dartBadge}>
                  <Ionicons name="flash" size={14} color={Colors.obsidian.onTertiaryContainer} />
                  <Text style={styles.dartBadgeText}>
                    Estimated savings +{dartSavingsPct.toFixed(3)}% vs best single venue
                  </Text>
                </View>
              )}
            </View>
          )}

          {quoteError && (
            <View style={styles.quoteErrorCard}>
              <Ionicons name="alert-circle-outline" size={16} color={Colors.loss} />
              <Text style={styles.quoteErrorText}>{quoteError}</Text>
            </View>
          )}

          {/* Info note */}
          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={17} color={Colors.steel} />
            <Text style={styles.infoText}>
              Live on-chain swapping is enabled for ALGO ↔ TST.
              Other pairs currently show oracle estimates; you can still store outputs in-app.
            </Text>
          </View>

          {portfolioAssets.length > 0 && (
            <View style={styles.rateCard}>
              <Text style={styles.cardLabel}>IN-APP STORED ASSETS</Text>
              {portfolioAssets.map((asset) => (
                <View key={asset.symbol} style={styles.rateRow}>
                  <Text style={styles.rateLabel}>{asset.symbol}</Text>
                  <Text style={styles.rateValue}>{asset.amount.toFixed(6)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Preview / execute button */}
          <TouchableOpacity
            style={[styles.previewButton, !canSwap && styles.previewButtonDisabled]}
            onPress={handlePreviewSwap}
            disabled={!canSwap}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Preview swap"
            accessibilityState={{ disabled: !canSwap }}
          >
            {isSwapping
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.previewButtonText}>
                  {isFetchingQuote ? 'Fetching Quote…' : 'Preview Estimate'}
                </Text>}
          </TouchableOpacity>

        </Animated.View>
      </ScrollView>

      {renderTokenModal(true)}
      {renderTokenModal(false)}
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

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: Colors.bg.screen },
  loadingContainer:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg.screen },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backButton:       { padding: 6, borderRadius: Radius.sm },
  headerTitle:      { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.navy },
  placeholder:      { width: 34 },
  content:          { flex: 1 },
  contentContainer: { padding: Spacing.xl, paddingBottom: 60 },
  swapCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.xl, ...Shadow.card,
  },
  cardLabel:  { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.steel, marginBottom: 12, letterSpacing: 0.8 },
  inputRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  amountInput: { flex: 1, fontSize: Typography.xxl, fontWeight: Typography.bold, color: Colors.navy, padding: 0 },
  tokenSelector: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.bg.input, paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
  },
  tokenIconSmall: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.bg.subtle, justifyContent: 'center', alignItems: 'center',
  },
  tokenSelectorText:   { marginRight: 2 },
  tokenSelectorSymbol: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.navy },
  tokenSelectorName:   { fontSize: Typography.xs, color: Colors.steel },
  balanceText:         { fontSize: Typography.xs, color: Colors.steel, marginTop: 8 },
  swapButtonContainer: { alignItems: 'center', marginVertical: -18, zIndex: 10 },
  swapIconButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: Colors.bg.screen, ...Shadow.card,
  },
  rateCard: {
    backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.lg,
    marginTop: Spacing.lg, gap: 10, ...Shadow.subtle,
  },
  rateRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rateLabel:   { fontSize: Typography.sm, color: Colors.steel },
  rateValue:   { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.navy },
  impactLow:   { color: Colors.gain },
  impactHigh:  { color: Colors.loss },
  dartBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.obsidian.tertiaryContainer, borderRadius: Radius.sm,
    paddingHorizontal: 10, paddingVertical: 6, marginTop: 4,
  },
  dartBadgeText: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.obsidian.onTertiaryContainer },
  quoteErrorCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.bg.input, borderRadius: Radius.md,
    padding: Spacing.md, marginTop: Spacing.lg,
    borderWidth: 1, borderColor: Colors.loss,
  },
  quoteErrorText: { flex: 1, fontSize: Typography.xs, color: Colors.loss, lineHeight: 18 },
  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.bg.input, borderRadius: Radius.md,
    padding: Spacing.md, marginTop: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border,
  },
  infoText:              { flex: 1, fontSize: Typography.xs, color: Colors.steel, lineHeight: 18 },
  previewButton: {
    backgroundColor: Colors.navy, borderRadius: Radius.md,
    paddingVertical: 15, alignItems: 'center', marginTop: Spacing.xl, ...Shadow.card,
  },
  previewButtonDisabled: { opacity: 0.4 },
  previewButtonText:     { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.white },
  modalOverlay:          { flex: 1, backgroundColor: 'rgba(6,14,32,0.72)', justifyContent: 'flex-end' },
  tokenModalContent: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '72%',
  },
  tokenModalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.divider,
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  tokenModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  tokenModalTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.navy },
  tokenList:       { padding: Spacing.lg },
  tokenItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: Radius.md,
    marginBottom: Spacing.sm, backgroundColor: Colors.bg.input,
  },
  tokenIcon:   { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  tokenInfo:   { flex: 1 },
  tokenSymbol: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.navy },
  tokenName:   { fontSize: Typography.xs, color: Colors.steel },
});
