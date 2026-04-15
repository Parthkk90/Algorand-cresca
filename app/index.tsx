import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import algosdk from 'algosdk';
import QRCode from 'react-native-qrcode-svg';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { AppNoticeAction, AppNoticeModal, AppNoticeTone } from '../components/AppNoticeModal';
import { ScreenContainer } from '../components/ScreenContainer';
import { HapticButton } from '../components/HapticButton';
import { TxSkeletonRow } from '../components/SkeletonRow';
import { InlineError } from '../components/InlineError';
import { TxSuccessCard } from '../components/TxSuccessCard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBasket } from '../constants/baskets';
import { Anim, Colors, Radius, Shadow, Spacing, Typography } from '../constants/theme';
import { algorandService, AlgorandTransaction } from '../services/algorandService';
import { positionStore } from '../services/positionStore';
import { onboardingEmitter } from '../utils/onboardingEmitter';
import { appPasswordService } from '../services/appPasswordService';

type QuickAction = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  action: 'send' | 'receive' | 'swap';
};

type MarketSnapshotItem = {
  symbol: string;
  price: number;
  change24h: number;
};

type LocalSchedule = {
  id: number;
  executeAt: number;
  active: boolean;
};

type BundleHomeTx = {
  txId: string;
  basketName: string;
  positionId: number;
  leverage: number;
  marginAlgo: number;
  openedAt: number;
};

type HomeActivityRow =
  | { kind: 'transfer'; tx: AlgorandTransaction; tsMs: number; key: string }
  | { kind: 'bundle'; tx: BundleHomeTx; tsMs: number; key: string };

const QUICK_ACTIONS: QuickAction[] = [
  { title: 'Send', icon: 'send', action: 'send' },
  { title: 'Receive', icon: 'qr-code-outline', action: 'receive' },
  { title: 'Swap', icon: 'swap-horizontal', action: 'swap' },
];

const ONBOARDING_DONE_KEY = 'cresca_onboarding_completed';
const HOME_MARKETS_CACHE_KEY = 'home_market_snapshot_cache_v1';
const HOME_MARKETS_RATE_LIMIT_MS = 120_000;
type OnboardingStep = 'welcome' | 'create-password' | 'seed-phrase' | 'verify-phrase' | 'recover';
type PasswordSetupMode = 'new-wallet' | 'password-only';

const CRESCA_LOGO_MARK = require('../assets/images/cresca-logo-mark.png');
const CRESCA_LOGO_WORDMARK = require('../assets/images/cresca-logo-wordmark.png');


export default function HomeScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [isLoading, setIsLoading] = useState(true);
  const [introVisible, setIntroVisible] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('welcome');
  const [passwordSetupMode, setPasswordSetupMode] = useState<PasswordSetupMode>('new-wallet');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedPasswordRisk, setAcceptedPasswordRisk] = useState(false);
  const [seedWords, setSeedWords] = useState<string[]>([]);
  const [verifyPool, setVerifyPool] = useState<string[]>([]);
  const [verifySelected, setVerifySelected] = useState<string[]>([]);
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState('0.000000');
  const [marketSnapshot, setMarketSnapshot] = useState<MarketSnapshotItem[]>([]);
  const marketRateLimitUntilRef = useRef(0);
  const [nextDueLabel, setNextDueLabel] = useState('No active schedules');
  const [activeScheduleCount, setActiveScheduleCount] = useState(0);
  const [txHistory, setTxHistory] = useState<AlgorandTransaction[]>([]);
  const [bundleTxHistory, setBundleTxHistory] = useState<BundleHomeTx[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const ringScale = useRef(new Animated.Value(0.9)).current;

  // Quick-pay inline modal state
  const [showQuickPay, setShowQuickPay] = useState(false);
  const [quickPayTo, setQuickPayTo] = useState('');
  const [quickPayAmount, setQuickPayAmount] = useState('');
  const [quickPayNote, setQuickPayNote] = useState('');
  const [quickPaySending, setQuickPaySending] = useState(false);

  // Quick-pay inline validation errors & success state
  const [quickPayToError, setQuickPayToError] = useState('');
  const [quickPayAmountError, setQuickPayAmountError] = useState('');
  const [quickPayTxId, setQuickPayTxId] = useState<string | null>(null);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [notice, setNotice] = useState<{
    title: string;
    message: string;
    tone: AppNoticeTone;
    actions?: AppNoticeAction[];
  } | null>(null);

  // Stagger entrance animation values
  const balanceAnim  = useRef(new Animated.Value(0)).current;
  const actionsAnim  = useRef(new Animated.Value(0)).current;
  const marketAnim   = useRef(new Animated.Value(0)).current;
  const balanceSlide = useRef(new Animated.Value(24)).current;
  const actionsSlide = useRef(new Animated.Value(24)).current;
  const marketSlide  = useRef(new Animated.Value(24)).current;

  const isCompact = width < 380;
  const isPixel3aLike = width >= 380 && width <= 410 && height >= 760 && height <= 830;
  const horizontalPadding = isCompact ? Spacing.lg : Spacing.xl;
  const bottomPadding = isPixel3aLike ? 28 : 40;
  const quickGap = isCompact ? Spacing.sm : Spacing.md;
  const quickItemWidth = (width - horizontalPadding * 2 - quickGap * 2) / 3;

  const shortAddress = useMemo(() => {
    if (!address) return '...';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, [address]);

  const passwordChecks = useMemo(() => {
    const hasLength = password.length >= 8;
    const hasSymbol = /[^A-Za-z0-9]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const score = [hasLength, hasSymbol, hasNumber, hasUpper].filter(Boolean).length;
    return { hasLength, hasSymbol, hasNumber, hasUpper, score };
  }, [password]);

  const activityHistory = useMemo<HomeActivityRow[]>(() => {
    const transfers: HomeActivityRow[] = txHistory
      .filter((tx) => {
        if (tx.amount <= 0) return false;
        if (tx.type === 'sent') return Boolean(tx.receiver);
        return Boolean(tx.sender);
      })
      .map((tx) => ({
      kind: 'transfer',
      tx,
      tsMs: tx.timestamp ? tx.timestamp * 1000 : 0,
      key: `transfer-${tx.txId}`,
      }));

    const bundles: HomeActivityRow[] = bundleTxHistory.map((tx) => ({
      kind: 'bundle',
      tx,
      tsMs: tx.openedAt,
      key: `bundle-${tx.positionId}-${tx.txId}`,
    }));

    return [...transfers, ...bundles]
      .sort((a, b) => b.tsMs - a.tsMs)
      .slice(0, 12);
  }, [txHistory, bundleTxHistory]);

  const showNotice = (
    title: string,
    message: string,
    tone: AppNoticeTone = 'info',
    actions?: AppNoticeAction[],
  ) => {
    setNotice({ title, message, tone, actions });
  };

  const loadTxHistory = async (addr: string) => {
    if (!addr?.trim()) {
      setTxHistory([]);
      setBundleTxHistory([]);
      return;
    }

    try {
      setTxLoading(true);
      const [txs, positions] = await Promise.all([
        algorandService.getTransactionHistory(addr, 10),
        positionStore.getAll(),
      ]);

      const bundleRows: BundleHomeTx[] = positions
        .sort((a, b) => b.openedAt - a.openedAt)
        .slice(0, 10)
        .map((position) => ({
          txId: position.txId,
          basketName: getBasket(position.basketId)?.name ?? 'Bundle Trade',
          positionId: position.positionId,
          leverage: position.leverage,
          marginAlgo: position.marginAlgo,
          openedAt: position.openedAt,
        }));

      setTxHistory(txs);
      setBundleTxHistory(bundleRows);
    } catch {
      // keep previous history on failure
    } finally {
      setTxLoading(false);
    }
  };

  const load = async () => {
    const wallet = await algorandService.initializeWallet();
    const bal = await algorandService.getBalance();
    setAddress(wallet.address);
    setBalance(bal.algo);
    await Promise.all([
      loadMarketSnapshot(),
      loadAutomationSummary(wallet.address),
      loadTxHistory(wallet.address),
    ]);
  };

  const refreshLiveData = async () => {
    const resolvedAddress = address?.trim();
    if (!resolvedAddress) return;

    try {
      const bal = await algorandService.getBalance();
      setBalance(bal.algo);
    } catch {
      // Keep the last known balance when refresh fails.
    }

    await Promise.all([
      loadMarketSnapshot(),
      loadAutomationSummary(resolvedAddress),
      loadTxHistory(resolvedAddress),
    ]);
  };

  const loadMarketSnapshot = async () => {
    const cachedRaw = await AsyncStorage.getItem(HOME_MARKETS_CACHE_KEY);
    const cached = cachedRaw ? (JSON.parse(cachedRaw) as MarketSnapshotItem[]) : [];

    if (Date.now() < marketRateLimitUntilRef.current) {
      setMarketSnapshot(cached);
      return;
    }

    try {
      const url =
        'https://api.coingecko.com/api/v3/simple/price?ids=algorand,usd-coin,bitcoin&vs_currencies=usd&include_24hr_change=true';
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 429) {
          marketRateLimitUntilRef.current = Date.now() + HOME_MARKETS_RATE_LIMIT_MS;
        }
        throw new Error(`Market API ${response.status}`);
      }
      const data = await response.json();

      const next: MarketSnapshotItem[] = [
        {
          symbol: 'ALGO',
          price: Number(data?.['algorand']?.usd ?? NaN),
          change24h: Number(data?.['algorand']?.usd_24h_change ?? NaN),
        },
        {
          symbol: 'USDC',
          price: Number(data?.['usd-coin']?.usd ?? NaN),
          change24h: Number(data?.['usd-coin']?.usd_24h_change ?? NaN),
        },
        {
          symbol: 'BTC',
          price: Number(data?.['bitcoin']?.usd ?? NaN),
          change24h: Number(data?.['bitcoin']?.usd_24h_change ?? NaN),
        },
      ].filter((row) => Number.isFinite(row.price));

      setMarketSnapshot(next);
      await AsyncStorage.setItem(HOME_MARKETS_CACHE_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn('Could not load live market snapshot:', error);
      setMarketSnapshot(cached);
    }
  };

  const loadAutomationSummary = async (addr?: string) => {
    try {
      const key = addr ?? address;
      if (!key) return;
      const raw = await AsyncStorage.getItem(`calendar_schedules_${key}`);
      const schedules = raw ? (JSON.parse(raw) as LocalSchedule[]) : [];
      const active = schedules.filter((s) => s.active);
      setActiveScheduleCount(active.length);

      if (active.length === 0) {
        setNextDueLabel('No active schedules');
        return;
      }

      const next = [...active].sort((a, b) => a.executeAt - b.executeAt)[0];
      const due = new Date(next.executeAt * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      setNextDueLabel(`Next due: ${due}`);
    } catch (error) {
      console.warn('Could not load automation summary:', error);
      setActiveScheduleCount(0);
      setNextDueLabel('Schedule data unavailable');
    }
  };

  useEffect(() => {
    const introAnim = Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }),
    ]);

    const ringPulse = Animated.loop(
      Animated.sequence([
        Animated.timing(ringScale, {
          toValue: 1.08,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(ringScale, {
          toValue: 0.94,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    introAnim.start();
    ringPulse.start();

    const introTimer = setTimeout(() => setIntroVisible(false), 1700);

    (async () => {
      try {
        const onboardingDone = await AsyncStorage.getItem(ONBOARDING_DONE_KEY);
        if (onboardingDone === '1') {
          const hasPassword = await appPasswordService.hasPassword();

          if (hasPassword && !appPasswordService.isSessionUnlocked()) {
            setShowUnlock(true);
            setShowOnboarding(false);
            setIsLoading(false);
            return;
          }

          if (!hasPassword) {
            setPasswordSetupMode('password-only');
            setOnboardingStep('create-password');
            setShowOnboarding(true);
            setIsLoading(false);
            return;
          }

          await load();
          setShowUnlock(false);
          setShowOnboarding(false);
        } else {
          setPasswordSetupMode('new-wallet');
          setOnboardingStep('welcome');
          setShowOnboarding(true);
        }
      } finally {
        setIsLoading(false);
      }
    })();

    return () => {
      clearTimeout(introTimer);
      ringPulse.stop();
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshLiveData();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (showOnboarding || isLoading || introVisible) return;

    const id = setInterval(() => {
      void refreshLiveData();
    }, 30000);

    return () => clearInterval(id);
  }, [showOnboarding, isLoading, introVisible]);

  // Stagger entrance animation — fires once data is ready
  useEffect(() => {
    if (isLoading || showOnboarding || introVisible) return;

    const makeAnim = (opacity: Animated.Value, slide: Animated.Value, delay: number) =>
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: Anim.normal,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slide, {
          toValue: 0,
          duration: Anim.normal,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]);

    Animated.parallel([
      makeAnim(balanceAnim,  balanceSlide,  0),
      makeAnim(actionsAnim,  actionsSlide,  80),
      makeAnim(marketAnim,   marketSlide,   160),
    ]).start();
  }, [isLoading, showOnboarding, introVisible]);

  const completeOnboarding = async () => {
    await AsyncStorage.setItem(ONBOARDING_DONE_KEY, '1');
    onboardingEmitter.emit();
    await load();
    setShowOnboarding(false);
  };

  const onCreateAccount = async () => {
    setPasswordSetupMode('new-wallet');
    setPassword('');
    setConfirmPassword('');
    setAcceptedPasswordRisk(false);
    setOnboardingStep('create-password');
  };

  const onContinueCreatePassword = async () => {
    if (password !== confirmPassword) {
      showNotice('Passwords Do Not Match', 'Please ensure both password fields match.', 'error');
      return;
    }

    if (passwordChecks.score < 3) {
      showNotice('Weak Password', 'Use at least 8 chars with a symbol, number, and uppercase letter.', 'error');
      return;
    }

    if (!acceptedPasswordRisk) {
      showNotice('Confirmation Required', 'Please confirm that you understand password recovery limitations.', 'error');
      return;
    }

    try {
      setOnboardingBusy(true);

      await appPasswordService.setPassword(password);

      if (passwordSetupMode === 'password-only') {
        await load();
        setShowOnboarding(false);
        setPassword('');
        setConfirmPassword('');
        setAcceptedPasswordRisk(false);
        return;
      }

      await algorandService.initializeWallet();
      const mnemonic = await algorandService.exportMnemonic();
      const words = mnemonic.trim().split(/\s+/);
      const shuffled = [...words].sort(() => Math.random() - 0.5);

      setSeedWords(words);
      setVerifyPool(shuffled);
      setVerifySelected([]);
      setOnboardingStep('seed-phrase');
    } catch (err: any) {
      showNotice('Create Account Failed', err?.message ?? 'Please try again.', 'error');
    } finally {
      setOnboardingBusy(false);
    }
  };

  const onCopySeedPhrase = async () => {
    if (!seedWords.length) return;
    await Clipboard.setStringAsync(seedWords.join(' '));
    showNotice('Copied', 'Recovery phrase copied to clipboard. Store it securely.', 'success');
  };

  const onPickVerifyWord = (word: string, index: number) => {
    const key = `${word}-${index}`;
    if (verifySelected.includes(key)) return;
    setVerifySelected((prev) => [...prev, key]);
  };

  const onSubmitVerifyPhrase = async () => {
    const pickedWords = verifySelected.map((entry) => entry.split('-')[0]);
    const matches = pickedWords.join(' ') === seedWords.join(' ');

    if (!matches) {
      showNotice('Phrase Mismatch', 'The selected order does not match your recovery phrase.', 'error');
      return;
    }

    try {
      setOnboardingBusy(true);
      await completeOnboarding();
    } finally {
      setOnboardingBusy(false);
    }
  };

  const onRecoverAccount = async () => {
    if (!recoveryPhrase.trim()) {
      showNotice('Recovery Phrase Required', 'Enter your 25-word mnemonic phrase.', 'error');
      return;
    }

    try {
      setOnboardingBusy(true);
      await algorandService.importFromMnemonic(recoveryPhrase.trim());
      await completeOnboarding();
      setRecoveryPhrase('');
    } catch (err: any) {
      showNotice('Recover Account Failed', err?.message ?? 'Please verify the mnemonic and try again.', 'error');
    } finally {
      setOnboardingBusy(false);
    }
  };

  const onUnlockApp = async () => {
    if (!unlockPassword) {
      setUnlockError('Password is required.');
      return;
    }

    try {
      setUnlockBusy(true);
      setUnlockError('');

      const ok = await appPasswordService.verifyPassword(unlockPassword);
      if (!ok) {
        setUnlockError('Incorrect password. Please try again.');
        return;
      }

      await load();
      setShowUnlock(false);
      setUnlockPassword('');
    } catch (err: any) {
      setUnlockError(err?.message ?? 'Unlock failed. Please try again.');
    } finally {
      setUnlockBusy(false);
    }
  };

  const handleQuickPay = async () => {
    setQuickPayToError('');
    setQuickPayAmountError('');
    setQuickPayTxId(null);

    const parsedAmount = parseFloat(quickPayAmount);
    let hasError = false;

    if (!quickPayTo.trim()) {
      setQuickPayToError('Recipient address is required.');
      hasError = true;
    } else if (!algosdk.isValidAddress(quickPayTo.trim())) {
      setQuickPayToError('Enter a valid Algorand address (58-char base32).');
      hasError = true;
    }

    if (!quickPayAmount.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setQuickPayAmountError('Enter a valid amount greater than 0.');
      hasError = true;
    } else if (parsedAmount > parseFloat(balance || '0')) {
      setQuickPayAmountError('Amount exceeds your available balance.');
      hasError = true;
    }

    if (hasError) return;

    try {
      setQuickPaySending(true);
      await algorandService.initializeWallet();
      const txId = await algorandService.sendAlgo(
        quickPayTo.trim(),
        parsedAmount,
        quickPayNote.trim(),
      );
      const bal = await algorandService.getBalance();
      setBalance(bal.algo);
      setQuickPayTxId(txId);
      if (address) {
        await loadTxHistory(address);
      }
      setQuickPayTo('');
      setQuickPayAmount('');
      setQuickPayNote('');
    } catch (err: any) {
      setQuickPayAmountError(String(err?.message ?? 'Send failed. Please try again.'));
    } finally {
      setQuickPaySending(false);
    }
  };

  if (introVisible) {
    return (
      <View style={styles.splashWrap}>
        <Animated.View style={[styles.splashRing, { transform: [{ scale: ringScale }] }]} />
        <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
          <Image source={CRESCA_LOGO_MARK} style={styles.splashLogo} resizeMode="contain" />
        </Animated.View>
        <Image source={CRESCA_LOGO_WORDMARK} style={styles.splashWordmark} resizeMode="contain" />
        <Text style={styles.splashSub}>Secure payments and swaps</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color={Colors.navy} />
      </View>
    );
  }

  if (showOnboarding) {
    const selectedWords = verifySelected.map((entry) => entry.split('-')[0]);

    return (
      <ScreenContainer style={styles.obsWrap}>
        <ScrollView contentContainerStyle={styles.obsContent} showsVerticalScrollIndicator={false}>
          <View style={styles.obsHeader}>
            {onboardingStep !== 'welcome' ? (
              <TouchableOpacity style={styles.obsIconBtn} onPress={() => setOnboardingStep('welcome')}>
                <Ionicons name="arrow-back" size={20} color={Colors.obsidian.primary} />
              </TouchableOpacity>
            ) : (
              <View style={styles.obsIconSpacer} />
            )}
            <Image source={CRESCA_LOGO_WORDMARK} style={styles.obsBrandLogo} resizeMode="contain" />
            <View style={styles.obsIconSpacer} />
          </View>

          {onboardingStep === 'welcome' ? (
            <View style={styles.obsSection}>
              <Text style={styles.obsTitle}>Secure your wallet</Text>
              <Text style={styles.obsSubtitle}>Create a new account or recover your existing account to continue.</Text>

              <TouchableOpacity style={styles.obsPrimaryBtn} onPress={onCreateAccount}>
                <Text style={styles.obsPrimaryText}>Create Account</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.obsGhostBtn} onPress={() => setOnboardingStep('recover')}>
                <Text style={styles.obsGhostText}>Recover Account</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {onboardingStep === 'create-password' ? (
            <View style={styles.obsSection}>
              <Text style={styles.obsTitle}>Create password</Text>
              <Text style={styles.obsSubtitle}>This password unlocks your wallet on this device only.</Text>

              <View style={styles.obsCard}>
                <Text style={styles.obsLabel}>New Password</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="new-password"
                  textContentType="newPassword"
                  importantForAutofill="yes"
                  placeholder="••••••••"
                  placeholderTextColor={Colors.obsidian.outline}
                  style={styles.obsInput}
                />

                <Text style={[styles.obsLabel, styles.obsLabelTop]}>Confirm Password</Text>
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  autoComplete="new-password"
                  textContentType="newPassword"
                  importantForAutofill="yes"
                  placeholder="••••••••"
                  placeholderTextColor={Colors.obsidian.outline}
                  style={styles.obsInput}
                />

                <View style={styles.obsStrengthRow}>
                  {[0, 1, 2, 3].map((i) => (
                    <View
                      key={`strength-${i}`}
                      style={[styles.obsStrengthBar, i < passwordChecks.score ? styles.obsStrengthBarActive : null]}
                    />
                  ))}
                </View>

                <View style={styles.obsChecklistGrid}>
                  <View style={styles.obsCheckItem}><Text style={styles.obsCheckText}>{passwordChecks.hasLength ? '✓' : '○'} 8+ characters</Text></View>
                  <View style={styles.obsCheckItem}><Text style={styles.obsCheckText}>{passwordChecks.hasSymbol ? '✓' : '○'} One symbol</Text></View>
                  <View style={styles.obsCheckItem}><Text style={styles.obsCheckText}>{passwordChecks.hasNumber ? '✓' : '○'} One number</Text></View>
                  <View style={styles.obsCheckItem}><Text style={styles.obsCheckText}>{passwordChecks.hasUpper ? '✓' : '○'} Uppercase</Text></View>
                </View>
              </View>

              <TouchableOpacity
                style={styles.obsRiskRow}
                onPress={() => setAcceptedPasswordRisk((v) => !v)}
                activeOpacity={0.85}
              >
                <Ionicons name={acceptedPasswordRisk ? 'checkbox' : 'square-outline'} size={18} color={Colors.obsidian.primary} />
                <Text style={styles.obsRiskText}>I understand CRESCA cannot recover this password.</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.obsPrimaryBtn, onboardingBusy && styles.disabledBtn]}
                onPress={onContinueCreatePassword}
                disabled={onboardingBusy}
              >
                <Text style={styles.obsPrimaryText}>{onboardingBusy ? 'Preparing...' : 'Continue'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {onboardingStep === 'seed-phrase' ? (
            <View style={styles.obsSection}>
              <Text style={styles.obsTitle}>Secret recovery phrase</Text>
              <Text style={styles.obsSubtitle}>Write these words down and store them securely.</Text>

              <View style={styles.obsWordsGrid}>
                {seedWords.map((word, index) => (
                  <View key={`seed-${index}`} style={styles.obsWordCard}>
                    <Text style={styles.obsWordIndex}>{String(index + 1).padStart(2, '0')}</Text>
                    <Text style={styles.obsWordText}>{word}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.obsWarningCard}>
                <Text style={styles.obsWarningTitle}>Never share your keys</Text>
                <Text style={styles.obsWarningText}>Anyone with these words can access your wallet and funds.</Text>
              </View>

              <TouchableOpacity style={styles.obsPrimaryBtn} onPress={() => setOnboardingStep('verify-phrase')}>
                <Text style={styles.obsPrimaryText}>I Saved It</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.obsGhostBtn} onPress={onCopySeedPhrase}>
                <Text style={styles.obsGhostText}>Copy To Clipboard</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {onboardingStep === 'verify-phrase' ? (
            <View style={styles.obsSection}>
              <Text style={styles.obsTitle}>Verify phrase</Text>
              <Text style={styles.obsSubtitle}>Tap words in the exact order to continue.</Text>

              <View style={styles.obsSelectedBox}>
                <View style={styles.obsSelectedWrap}>
                  {selectedWords.map((word, index) => (
                    <View key={`picked-${index}`} style={styles.obsSelectedChip}>
                      <Text style={styles.obsSelectedIndex}>{index + 1}</Text>
                      <Text style={styles.obsSelectedText}>{word}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.obsPoolGrid}>
                {verifyPool.map((word, index) => {
                  const key = `${word}-${index}`;
                  const used = verifySelected.includes(key);
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.obsPoolWord, used && styles.obsPoolWordUsed]}
                      onPress={() => onPickVerifyWord(word, index)}
                      disabled={used}
                    >
                      <Text style={[styles.obsPoolText, used && styles.obsPoolTextUsed]}>{word}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[styles.obsPrimaryBtn, onboardingBusy && styles.disabledBtn]}
                onPress={onSubmitVerifyPhrase}
                disabled={onboardingBusy || verifySelected.length !== seedWords.length}
              >
                <Text style={styles.obsPrimaryText}>{onboardingBusy ? 'Verifying...' : 'Submit Seed Phrase'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {onboardingStep === 'recover' ? (
            <View style={styles.obsSection}>
              <Text style={styles.obsTitle}>Recover wallet</Text>
              <Text style={styles.obsSubtitle}>Paste your 25-word phrase to restore access.</Text>

              <View style={styles.obsCard}>
                <Text style={styles.obsLabel}>Recovery Phrase</Text>
                <TextInput
                  value={recoveryPhrase}
                  onChangeText={setRecoveryPhrase}
                  placeholder="word1 word2 ... word25"
                  placeholderTextColor={Colors.obsidian.outline}
                  multiline
                  style={styles.obsRecoveryInput}
                  autoCapitalize="none"
                />
              </View>

              <TouchableOpacity
                style={[styles.obsPrimaryBtn, onboardingBusy && styles.disabledBtn]}
                onPress={onRecoverAccount}
                disabled={onboardingBusy}
              >
                <Text style={styles.obsPrimaryText}>{onboardingBusy ? 'Recovering...' : 'Recover And Continue'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      </ScreenContainer>
    );
  }

  if (showUnlock) {
    return (
      <ScreenContainer style={styles.obsWrap}>
        <View style={[styles.obsContent, styles.unlockContent]}>
          <View style={styles.obsHeader}>
            <View style={styles.obsIconSpacer} />
            <Image source={CRESCA_LOGO_WORDMARK} style={styles.obsBrandLogo} resizeMode="contain" />
            <View style={styles.obsIconSpacer} />
          </View>

          <View style={styles.obsSection}>
            <Text style={styles.obsTitle}>Unlock wallet</Text>
            <Text style={styles.obsSubtitle}>Enter your app password to continue.</Text>

            <View style={styles.obsCard}>
              <Text style={styles.obsLabel}>Password</Text>
              <TextInput
                value={unlockPassword}
                onChangeText={(value) => {
                  setUnlockPassword(value);
                  if (unlockError) setUnlockError('');
                }}
                secureTextEntry
                autoComplete="password"
                textContentType="password"
                importantForAutofill="yes"
                placeholder="••••••••"
                placeholderTextColor={Colors.obsidian.outline}
                style={styles.obsInput}
              />
              {unlockError ? <Text style={styles.unlockError}>{unlockError}</Text> : null}
            </View>

            <TouchableOpacity
              style={[styles.obsPrimaryBtn, unlockBusy && styles.disabledBtn]}
              onPress={onUnlockApp}
              disabled={unlockBusy}
            >
              <Text style={styles.obsPrimaryText}>{unlockBusy ? 'Unlocking...' : 'Unlock'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: horizontalPadding,
            paddingBottom: bottomPadding,
          },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: balanceAnim, transform: [{ translateY: balanceSlide }] }}>
          <View style={[styles.hero, isCompact && styles.heroCompact]}>
            <View style={styles.heroTop}>
              <Image
                source={CRESCA_LOGO_WORDMARK}
                style={[styles.brandLogo, isCompact && styles.brandLogoCompact]}
                resizeMode="contain"
              />
              <View style={styles.badge}>
                <View style={styles.badgeDot} />
                <Text style={styles.badgeText}>Testnet Active</Text>
              </View>
            </View>
            <Text style={styles.totalLabel}>Portfolio Value</Text>
            <Text style={[styles.totalValue, isCompact && styles.totalValueCompact, { fontVariant: ['tabular-nums'] }]}>
              ${(parseFloat(balance) * 0.18).toFixed(2)}
            </Text>
            <Text
              style={[styles.subValue, isCompact && styles.subValueCompact, { fontVariant: ['tabular-nums'] }]}
              accessibilityLabel={`Balance: ${balance} ALGO`}
            >
              {balance} ALGO
            </Text>
            <Text style={styles.address}>{shortAddress}</Text>
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: actionsAnim, transform: [{ translateY: actionsSlide }] }}>
          <View style={[styles.quickRow, { gap: quickGap }]}>
            {QUICK_ACTIONS.map((item) => (
              <HapticButton
                key={item.title}
                style={[styles.quickItem, { width: quickItemWidth }]}
                onPress={() => {
                  if (item.action === 'send') {
                    setShowQuickPay(true);
                    return;
                  }
                  if (item.action === 'receive') {
                    setShowReceiveModal(true);
                    return;
                  }
                  router.push('/swap');
                }}
                accessibilityLabel={item.title}
              >
                <View style={styles.quickIcon}>
                  <Ionicons name={item.icon} size={18} color={Colors.navy} />
                </View>
                <Text style={styles.quickText}>{item.title}</Text>
              </HapticButton>
            ))}
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: marketAnim, transform: [{ translateY: marketSlide }] }}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Market Snapshot</Text>
            <TouchableOpacity
              onPress={() => router.push('/markets')}
              accessibilityRole="button"
              accessibilityLabel="View all markets"
            >
              <Text style={styles.sectionLink}>View all</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.marketCard}>
            {marketSnapshot.length === 0 ? (
              <View style={styles.marketRowLast}>
                <Text style={styles.asset}>Live market data unavailable</Text>
                <Text style={styles.flat}>--</Text>
              </View>
            ) : (
              marketSnapshot.map((row, index) => (
                <View key={row.symbol} style={index === marketSnapshot.length - 1 ? styles.marketRowLast : styles.marketRow}>
                  <Text style={styles.asset}>{row.symbol}</Text>
                  <View style={styles.priceRow}>
                    <Text style={[styles.price, { fontVariant: ['tabular-nums'] }]}>
                      ${row.price.toFixed(row.symbol === 'BTC' ? 0 : 4)}
                    </Text>
                  </View>
                  <View style={styles.changeRow}>
                    <Ionicons
                      name={row.change24h > 0 ? 'arrow-up' : row.change24h < 0 ? 'arrow-down' : 'remove'}
                      size={11}
                      color={row.change24h > 0 ? Colors.gain : row.change24h < 0 ? Colors.loss : Colors.text.muted}
                    />
                    <Text
                      style={[
                        styles.assetChange,
                        { fontVariant: ['tabular-nums'] },
                        row.change24h > 0 ? styles.up : row.change24h < 0 ? styles.down : styles.flat,
                      ]}
                    >
                      {row.change24h > 0 ? '+' : ''}
                      {row.change24h.toFixed(1)}%
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Automations</Text>
            <TouchableOpacity
              onPress={() => router.push('/calendar')}
              accessibilityRole="button"
              accessibilityLabel="Manage payment schedules"
            >
              <Text style={styles.sectionLink}>Manage</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.automationCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.automationTitle}>{activeScheduleCount} active schedules</Text>
              <Ionicons name="calendar" size={16} color={Colors.steel} />
            </View>
            <Text style={styles.automationMeta}>{nextDueLabel}</Text>
          </View>

          {/* Transaction History */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            {txLoading && <ActivityIndicator size="small" color={Colors.navy} />}
          </View>

          <View style={styles.txCard}>
            {txLoading ? (
              <>
                <TxSkeletonRow />
                <TxSkeletonRow />
                <TxSkeletonRow />
              </>
            ) : activityHistory.length === 0 ? (
              <View style={styles.txEmpty}>
                <Ionicons name="receipt-outline" size={28} color={Colors.sky} />
                <Text style={styles.txEmptyText}>No transactions yet</Text>
              </View>
            ) : (
              activityHistory.map((row, index) => {
                const isLast = index === activityHistory.length - 1;
                const txId = row.kind === 'transfer' ? row.tx.txId : row.tx.txId;

                if (row.kind === 'bundle') {
                  const dateStr = new Date(row.tx.openedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <TouchableOpacity
                      key={row.key}
                      style={isLast ? styles.txRowLast : styles.txRow}
                      activeOpacity={0.85}
                      onPress={() =>
                        Linking.openURL(`https://lora.algokit.io/testnet/transaction/${txId}`)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Open bundle transaction for ${row.tx.basketName} on explorer`}
                    >
                      <View style={[styles.txIcon, styles.txIconBundle]}>
                        <Ionicons name="layers-outline" size={14} color={Colors.navy} />
                      </View>

                      <View style={styles.txMeta}>
                        <Text style={styles.txParty} numberOfLines={1}>Bundle · {row.tx.basketName}</Text>
                        <Text style={styles.txNote} numberOfLines={1}>
                          Position #{row.tx.positionId} · {row.tx.leverage}x leverage
                        </Text>
                        <Text style={styles.txDate}>{dateStr}</Text>
                      </View>

                      <View style={styles.txRight}>
                        <Text style={[styles.txAmount, styles.txAmountBundle]}>
                          {row.tx.marginAlgo.toFixed(3)} ALGO
                        </Text>
                        <Text style={styles.txExplorerHint}>Tap for explorer ↗</Text>
                      </View>
                    </TouchableOpacity>
                  );
                }

                const isSent = row.tx.type === 'sent';
                const algoAmount = (row.tx.amount / 1_000_000).toFixed(4);
                const counterparty = isSent ? row.tx.receiver : row.tx.sender;
                const shortParty = counterparty
                  ? `${counterparty.slice(0, 6)}…${counterparty.slice(-4)}`
                  : '—';
                const dateStr = row.tx.timestamp
                  ? new Date(row.tx.timestamp * 1000).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—';

                return (
                  <TouchableOpacity
                    key={row.key}
                    style={isLast ? styles.txRowLast : styles.txRow}
                    activeOpacity={0.85}
                    onPress={() =>
                      Linking.openURL(`https://lora.algokit.io/testnet/transaction/${txId}`)
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Open transfer transaction on explorer"
                  >
                    <View style={[styles.txIcon, isSent ? styles.txIconSent : styles.txIconRecv]}>
                      <Ionicons
                        name={isSent ? 'arrow-up' : 'arrow-down'}
                        size={14}
                        color={isSent ? Colors.loss : Colors.gain}
                      />
                    </View>

                    <View style={styles.txMeta}>
                      <Text style={styles.txParty} numberOfLines={1}>
                        {isSent ? 'To ' : 'From '}{shortParty}
                      </Text>
                      {row.tx.note ? (
                        <Text style={styles.txNote} numberOfLines={1}>{row.tx.note}</Text>
                      ) : null}
                      <Text style={styles.txDate}>{dateStr}</Text>
                    </View>

                    <View style={styles.txRight}>
                      <Text style={[styles.txAmount, isSent ? styles.txAmountSent : styles.txAmountRecv]}>
                        {isSent ? '−' : '+'}{algoAmount} ALGO
                      </Text>
                      <Text style={styles.txExplorerHint}>Tap for explorer ↗</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </Animated.View>
      </ScrollView>

      {/* Inline Quick-Pay modal — stays on Home screen */}
      <Modal
        visible={showQuickPay}
        animationType="slide"
        transparent
        onRequestClose={() => setShowQuickPay(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Quick Pay</Text>
              <TouchableOpacity onPress={() => setShowQuickPay(false)}>
                <Ionicons name="close" size={22} color={Colors.steel} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Recipient Address</Text>
            <TextInput
              value={quickPayTo}
              onChangeText={(v) => { setQuickPayTo(v); setQuickPayToError(''); }}
              placeholder="Algorand address (58 chars)"
              placeholderTextColor={Colors.sky}
              style={styles.modalInput}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Recipient address"
            />
            <InlineError message={quickPayToError} />

            <Text style={styles.modalLabel}>Amount (ALGO)</Text>
            <TextInput
              value={quickPayAmount}
              onChangeText={(v) => { setQuickPayAmount(v); setQuickPayAmountError(''); }}
              placeholder="0.00"
              placeholderTextColor={Colors.sky}
              style={styles.modalInput}
              keyboardType="decimal-pad"
              accessibilityLabel="Amount in ALGO"
            />
            <InlineError message={quickPayAmountError} />

            <Text style={styles.modalLabel}>Note (optional)</Text>
            <TextInput
              value={quickPayNote}
              onChangeText={setQuickPayNote}
              placeholder="What's this for?"
              placeholderTextColor={Colors.sky}
              style={styles.modalInput}
              accessibilityLabel="Payment note"
            />

            <Text style={[styles.modalAvail, { fontVariant: ['tabular-nums'] }]}>
              Available: {parseFloat(balance).toFixed(3)} ALGO
            </Text>

            {quickPayTxId ? (
              <TxSuccessCard
                txId={quickPayTxId}
                onDismiss={() => {
                  setQuickPayTxId(null);
                  setShowQuickPay(false);
                }}
              />
            ) : (
              <HapticButton
                style={quickPaySending ? [styles.modalSendBtn, { opacity: 0.6 }] : [styles.modalSendBtn]}
                onPress={handleQuickPay}
                disabled={quickPaySending}
                accessibilityLabel={quickPaySending ? 'Sending payment' : 'Send payment'}
              >
                {quickPaySending ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <>
                    <Text style={styles.modalSendText}>Send</Text>
                    <Ionicons name="arrow-forward" size={16} color={Colors.white} />
                  </>
                )}
              </HapticButton>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showReceiveModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowReceiveModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Receive ALGO</Text>
              <TouchableOpacity onPress={() => setShowReceiveModal(false)}>
                <Ionicons name="close" size={22} color={Colors.steel} />
              </TouchableOpacity>
            </View>

            <View style={styles.qrWrap}>
              <QRCode value={address || 'no-address'} size={220} backgroundColor={Colors.white} color={Colors.navy} />
            </View>

            <Text style={styles.modalLabel}>Your Address</Text>
            <Text selectable style={styles.receiveAddress}>{address || 'Wallet address unavailable'}</Text>

            <HapticButton
              style={styles.modalSendBtn}
              onPress={async () => {
                if (!address) return;
                await Clipboard.setStringAsync(address);
                showNotice('Copied', 'Wallet address copied to clipboard.', 'success');
              }}
              accessibilityLabel="Copy wallet address"
            >
              <Text style={styles.modalSendText}>Copy Address</Text>
              <Ionicons name="copy-outline" size={16} color={Colors.white} />
            </HapticButton>
          </View>
        </View>
      </Modal>

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
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { paddingTop: Spacing.xl },
  priceRow: { flexDirection: 'row', alignItems: 'center' },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  splashWrap: {
    flex: 1,
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashRing: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: Colors.bg.subtle,
  },
  splashLogo: { width: 96, height: 96 },
  splashWordmark: { width: 180, height: 46, marginTop: Spacing.lg },
  splashSub: { marginTop: 6, color: Colors.steel, fontSize: Typography.sm },
  loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.cream },
  obsWrap: { flex: 1, backgroundColor: Colors.obsidian.background },
  obsContent: { padding: Spacing.xl, paddingBottom: 36 },
  obsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  obsIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.obsidian.surface,
  },
  obsIconSpacer: { width: 34, height: 34 },
  obsBrandLogo: { width: 128, height: 34 },
  obsSection: { paddingBottom: 20 },
  obsTitle: { color: Colors.obsidian.text, fontSize: 32, fontWeight: Typography.bold },
  obsSubtitle: { color: Colors.obsidian.textMuted, fontSize: Typography.base, marginTop: 8, marginBottom: Spacing.xl },
  obsCard: {
    backgroundColor: Colors.obsidian.surfaceLow,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.obsidian.outline,
    padding: Spacing.lg,
  },
  obsLabel: {
    color: Colors.obsidian.textMuted,
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  obsLabelTop: { marginTop: Spacing.md },
  obsInput: {
    marginTop: 8,
    backgroundColor: Colors.obsidian.background,
    borderRadius: 16,
    color: Colors.obsidian.text,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.obsidian.outline,
    fontSize: Typography.md,
  },
  obsStrengthRow: { flexDirection: 'row', gap: 6, marginTop: Spacing.md },
  obsStrengthBar: { height: 6, flex: 1, borderRadius: 4, backgroundColor: Colors.obsidian.surfaceHigh },
  obsStrengthBarActive: { backgroundColor: Colors.obsidian.tertiary },
  obsChecklistGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: Spacing.md },
  obsCheckItem: {
    backgroundColor: Colors.obsidian.surface,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.obsidian.outline,
  },
  obsCheckText: { color: Colors.obsidian.textMuted, fontSize: Typography.xs, fontWeight: Typography.medium },
  obsRiskRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: Spacing.md, marginBottom: Spacing.md },
  obsRiskText: { color: Colors.obsidian.textMuted, fontSize: Typography.xs, flex: 1 },
  obsPrimaryBtn: {
    backgroundColor: Colors.obsidian.primary,
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  obsPrimaryText: { color: Colors.obsidian.background, fontSize: Typography.base, fontWeight: Typography.bold },
  obsGhostBtn: {
    marginTop: Spacing.sm,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.obsidian.outline,
    backgroundColor: Colors.obsidian.surface,
    paddingVertical: 14,
    alignItems: 'center',
  },
  obsGhostText: { color: Colors.obsidian.text, fontSize: Typography.sm, fontWeight: Typography.semibold },
  obsWordsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  obsWordCard: {
    width: '48%',
    backgroundColor: Colors.obsidian.surfaceLow,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.obsidian.outline,
    padding: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  obsWordIndex: { color: Colors.obsidian.primary, fontSize: Typography.xs, width: 20 },
  obsWordText: { color: Colors.obsidian.text, fontSize: Typography.sm, fontWeight: Typography.semibold },
  obsWarningCard: {
    marginTop: Spacing.md,
    backgroundColor: Colors.obsidian.warningContainer,
    borderLeftWidth: 3,
    borderLeftColor: Colors.obsidian.warning,
    borderRadius: 12,
    padding: Spacing.md,
  },
  obsWarningTitle: { color: Colors.obsidian.warning, fontSize: Typography.sm, fontWeight: Typography.bold, textTransform: 'uppercase' },
  obsWarningText: { color: Colors.obsidian.warning, fontSize: Typography.xs, marginTop: 4 },
  obsSelectedBox: {
    minHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.obsidian.outline,
    backgroundColor: Colors.obsidian.surfaceLow,
    padding: Spacing.md,
  },
  obsSelectedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  obsSelectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primaryContainer,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  obsSelectedIndex: { color: Colors.obsidian.primary, fontSize: 10, fontWeight: Typography.bold },
  obsSelectedText: { color: Colors.obsidian.text, fontSize: Typography.xs, fontWeight: Typography.semibold },
  obsPoolGrid: { marginTop: Spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  obsPoolWord: {
    backgroundColor: Colors.obsidian.surface,
    borderWidth: 1,
    borderColor: Colors.obsidian.outline,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  obsPoolWordUsed: { opacity: 0.35 },
  obsPoolText: { color: Colors.obsidian.text, fontSize: Typography.xs, fontWeight: Typography.medium },
  obsPoolTextUsed: { textDecorationLine: 'line-through' },
  obsRecoveryInput: {
    marginTop: 8,
    minHeight: 110,
    textAlignVertical: 'top',
    backgroundColor: Colors.obsidian.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.obsidian.outline,
    color: Colors.obsidian.text,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: Typography.sm,
  },
  disabledBtn: { opacity: 0.6 },
  unlockContent: { flex: 1, justifyContent: 'center' },
  unlockError: {
    color: Colors.obsidian.warning,
    marginTop: 10,
    fontSize: Typography.xs,
  },
  hero: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    ...Shadow.card,
  },
  heroCompact: { padding: Spacing.lg },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  brandLogo: { width: 122, height: 32 },
  brandLogoCompact: { width: 108, height: 28 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(123,208,255,0.16)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.obsidian.tertiary, marginRight: 6 },
  badgeText: { color: Colors.text.primary, fontSize: Typography.xs, fontWeight: Typography.medium },
  totalLabel: { color: Colors.text.secondary, fontSize: Typography.sm },
  totalValue: { color: Colors.text.primary, fontSize: 38, fontWeight: Typography.bold, marginTop: 4 },
  totalValueCompact: { fontSize: 34 },
  subValue: { color: Colors.text.secondary, fontSize: Typography.base, marginTop: 2 },
  subValueCompact: { fontSize: Typography.sm },
  address: {
    marginTop: Spacing.md,
    color: Colors.text.primary,
    fontSize: Typography.xs,
    backgroundColor: Colors.bg.subtle,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xl },
  quickItem: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.bg.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  quickText: { color: Colors.navy, fontSize: Typography.xs, fontWeight: Typography.semibold },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  sectionTitle: { color: Colors.navy, fontSize: Typography.base, fontWeight: Typography.semibold },
  sectionLink: { color: Colors.steel, fontSize: Typography.sm, fontWeight: Typography.medium },
  marketCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xl,
  },
  marketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  marketRowLast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  asset: { color: Colors.navy, fontSize: Typography.sm, fontWeight: Typography.semibold, minWidth: 52 },
  price: { color: Colors.navy, fontSize: Typography.sm, fontWeight: Typography.medium },
  assetChange: { fontSize: Typography.sm, fontWeight: Typography.semibold },
  up: { color: Colors.gain, fontSize: Typography.sm, fontWeight: Typography.semibold },
  down: { color: Colors.loss, fontSize: Typography.sm, fontWeight: Typography.semibold },
  flat: { color: Colors.steel, fontSize: Typography.sm, fontWeight: Typography.semibold },
  automationCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  automationTitle: { color: Colors.navy, fontSize: Typography.base, fontWeight: Typography.semibold },
  automationMeta: { color: Colors.steel, fontSize: Typography.sm, marginTop: 6 },

  // Transaction history
  txCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xl,
  },
  txEmpty: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: 8,
  },
  txEmptyText: { color: Colors.sky, fontSize: Typography.sm },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    gap: Spacing.sm,
  },
  txRowLast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  txIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txIconSent: { backgroundColor: Colors.lossBg },
  txIconRecv: { backgroundColor: Colors.gainBg },
  txIconBundle: { backgroundColor: Colors.bg.subtle },
  txMeta: { flex: 1, gap: 2 },
  txParty: { color: Colors.navy, fontSize: Typography.sm, fontWeight: Typography.medium },
  txNote: { color: Colors.steel, fontSize: Typography.xs, fontStyle: 'italic' },
  txDate: { color: Colors.sky, fontSize: Typography.xs },
  txRight: { alignItems: 'flex-end', gap: 4 },
  txAmount: { fontSize: Typography.sm, fontWeight: Typography.semibold },
  txAmountSent: { color: Colors.loss },
  txAmountRecv: { color: Colors.gain },
  txAmountBundle: { color: Colors.navy },
  txExplorerHint: { color: Colors.steel, fontSize: 10, fontWeight: Typography.semibold },

  // Quick-pay modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.xl,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    color: Colors.navy,
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
  },
  modalLabel: {
    color: Colors.navy,
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    marginBottom: 6,
    marginTop: Spacing.md,
  },
  modalInput: {
    backgroundColor: Colors.bg.input,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    color: Colors.navy,
    fontSize: Typography.sm,
  },
  qrWrap: {
    alignSelf: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  receiveAddress: {
    color: Colors.navy,
    fontSize: Typography.xs,
    backgroundColor: Colors.bg.input,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  modalAvail: { color: Colors.steel, fontSize: Typography.xs, marginTop: 8 },
  modalSendBtn: {
    marginTop: Spacing.xl,
    backgroundColor: Colors.navy,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  modalSendText: { color: Colors.white, fontSize: Typography.sm, fontWeight: Typography.semibold },
});
