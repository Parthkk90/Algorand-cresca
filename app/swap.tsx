import { Ionicons } from "@expo/vector-icons";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ScreenContainer } from "../components/ScreenContainer";
import { SYNTHETIC_ASA_IDS } from "../constants/baskets";
import { algorandService } from "../services/algorandService";
import { dartRouterService, SwapQuote } from "../services/dartRouterService";
import { pythOracleService } from "../services/pythOracleService";
import { StoredSwapAsset, swapPortfolioStore } from "../services/swapPortfolioStore";
import {
  AssetChip,
  CrescaSheet,
  CrescaInput,
  HeaderBar,
  LiveBadge,
  PrimaryButton,
} from "../src/components/ui";
import { C, H_PAD, R, T } from "../src/theme";

const DART_APP_ID = 758849063;

type SwapState =
  | "idle"
  | "quoting"
  | "routing"
  | "awaiting_sign"
  | "broadcasting"
  | "confirmed"
  | "failed";

type Token = {
  symbol: string;
  name: string;
  networkColor: string;
  asaId: number;
  decimals: number;
};

const TOKENS: Token[] = [
  {
    symbol: "ALGO",
    name: "Algorand",
    networkColor: C.networks.algorand,
    asaId: 0,
    decimals: 6,
  },
  {
    symbol: "TST",
    name: "Cresca Test Asset",
    networkColor: C.brand.teal,
    asaId: 758849338,
    decimals: 6,
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    networkColor: C.networks.ethereum,
    asaId: SYNTHETIC_ASA_IDS.USDC,
    decimals: 6,
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    networkColor: C.networks.bitcoin,
    asaId: SYNTHETIC_ASA_IDS.BTC,
    decimals: 6,
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    networkColor: C.networks.ethereum,
    asaId: SYNTHETIC_ASA_IDS.ETH,
    decimals: 6,
  },
  {
    symbol: "SOL",
    name: "Solana",
    networkColor: C.networks.polygon,
    asaId: SYNTHETIC_ASA_IDS.SOL,
    decimals: 6,
  },
  {
    symbol: "ADA",
    name: "Cardano",
    networkColor: C.networks.polygon,
    asaId: SYNTHETIC_ASA_IDS.ADA,
    decimals: 6,
  },
  {
    symbol: "XRP",
    name: "Ripple",
    networkColor: C.networks.ethereum,
    asaId: SYNTHETIC_ASA_IDS.XRP,
    decimals: 6,
  },
  {
    symbol: "SUI",
    name: "Sui",
    networkColor: C.networks.polygon,
    asaId: SYNTHETIC_ASA_IDS.SUI,
    decimals: 6,
  },
  {
    symbol: "APT",
    name: "Aptos",
    networkColor: C.networks.polygon,
    asaId: SYNTHETIC_ASA_IDS.APT,
    decimals: 6,
  },
  {
    symbol: "NEAR",
    name: "Near",
    networkColor: C.networks.ethereum,
    asaId: SYNTHETIC_ASA_IDS.NEAR,
    decimals: 6,
  },
  {
    symbol: "AVAX",
    name: "Avalanche",
    networkColor: C.networks.ethereum,
    asaId: SYNTHETIC_ASA_IDS.AVAX,
    decimals: 6,
  },
  {
    symbol: "MOVE",
    name: "Movement",
    networkColor: C.networks.ethereum,
    asaId: SYNTHETIC_ASA_IDS.MOVE,
    decimals: 6,
  },
];

const TOKEN_BY_SYMBOL: Record<string, Token> = TOKENS.reduce((acc, token) => {
  acc[token.symbol] = token;
  return acc;
}, {} as Record<string, Token>);

function parseAmountInput(raw: string): string {
  const normalized = raw.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const firstDot = normalized.indexOf(".");
  const compact =
    firstDot === -1
      ? normalized
      : `${normalized.slice(0, firstDot + 1)}${normalized
          .slice(firstDot + 1)
          .replace(/\./g, "")}`;

  const [intPart, decimalPart] = compact.split(".");
  if (decimalPart === undefined) return intPart;
  return `${intPart}.${decimalPart.slice(0, 6)}`;
}

function toBaseUnits(amount: number, decimals: number): number {
  return Math.round(amount * Math.pow(10, decimals));
}

function fromBaseUnits(amount: number, decimals: number): number {
  return amount / Math.pow(10, decimals);
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "--";
  if (value >= 1000) return `$${value.toFixed(2)}`;
  if (value >= 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(6)}`;
}

function shortAmount(value: number, maxFraction = 6): string {
  if (!Number.isFinite(value)) return "0";
  const fixed = value.toFixed(maxFraction);
  return fixed.replace(/\.0+$/, "").replace(/(\.[0-9]*?)0+$/, "$1");
}

export default function SwapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string; to?: string }>();

  const [walletAddress, setWalletAddress] = useState("");
  const [algoBalance, setAlgoBalance] = useState(0);
  const [portfolioAssets, setPortfolioAssets] = useState<StoredSwapAsset[]>([]);

  const [fromToken, setFromToken] = useState<Token>(TOKEN_BY_SYMBOL.ETH);
  const [toToken, setToToken] = useState<Token>(TOKEN_BY_SYMBOL.USDC);

  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [quote, setQuote] = useState<SwapQuote | null>(null);

  const [swapState, setSwapState] = useState<SwapState>("idle");
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [lastTxId, setLastTxId] = useState<string | null>(null);

  const [slippagePct, setSlippagePct] = useState(0.5);
  const [customSlippage, setCustomSlippage] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [tokenSheetTarget, setTokenSheetTarget] = useState<"from" | "to">("from");
  const [tokenSearch, setTokenSearch] = useState("");

  const tokenSheetRef = useRef<BottomSheetModal | null>(null);
  const slippageSheetRef = useRef<BottomSheetModal | null>(null);

  const [pythRate, setPythRate] = useState<number | null>(null);
  const [pythLoading, setPythLoading] = useState(true);

  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    const from = String(params.from ?? "").toUpperCase();
    const to = String(params.to ?? "").toUpperCase();
    const nextFrom = TOKEN_BY_SYMBOL[from];
    const nextTo = TOKEN_BY_SYMBOL[to];

    if (nextFrom && nextTo && nextFrom.symbol !== nextTo.symbol) {
      setFromToken(nextFrom);
      setToToken(nextTo);
    }
  }, [params.from, params.to]);

  useEffect(() => {
    void loadPairRate();
  }, [fromToken.symbol, toToken.symbol]);

  useEffect(() => {
    if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);

    const parsed = Number(fromAmount);
    if (!fromAmount || !Number.isFinite(parsed) || parsed <= 0) {
      setToAmount("");
      setQuote(null);
      setQuoteError(null);
      if (swapState === "quoting") setSwapState("idle");
      return;
    }

    quoteTimerRef.current = setTimeout(() => {
      void loadQuote();
    }, 500);

    return () => {
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
    };
  }, [fromAmount, fromToken.asaId, toToken.asaId]);

  const initialize = async () => {
    setIsBootstrapping(true);
    try {
      const wallet = await algorandService.initializeWallet();
      setWalletAddress(wallet.address);

      const [{ algo }, stored] = await Promise.all([
        algorandService.getBalance(),
        swapPortfolioStore.getAll(wallet.address),
      ]);

      setAlgoBalance(Number(algo));
      setPortfolioAssets(stored);
    } catch (error: any) {
      setExecutionError(error?.message ?? "Failed to initialize wallet");
    } finally {
      setIsBootstrapping(false);
    }
  };

  const refreshWalletSnapshots = async () => {
    if (!walletAddress) return;
    const [{ algo }, stored] = await Promise.all([
      algorandService.getBalance(),
      swapPortfolioStore.getAll(walletAddress),
    ]);
    setAlgoBalance(Number(algo));
    setPortfolioAssets(stored);
  };

  const getTokenBalance = (token: Token): number => {
    if (token.asaId === 0) return algoBalance;
    return portfolioAssets.find((asset) => asset.symbol === token.symbol)?.amount ?? 0;
  };

  const loadPairRate = async () => {
    setPythLoading(true);
    try {
      if (fromToken.symbol === toToken.symbol) {
        setPythRate(1);
        return;
      }

      const [fromPrice, toPrice] = await Promise.all([
        fromToken.symbol === "USDC"
          ? Promise.resolve({ price: 1 })
          : pythOracleService.getPrice(fromToken.symbol),
        toToken.symbol === "USDC"
          ? Promise.resolve({ price: 1 })
          : pythOracleService.getPrice(toToken.symbol),
      ]);

      if (!fromPrice?.price || !toPrice?.price || toPrice.price <= 0) {
        setPythRate(null);
        return;
      }

      setPythRate(fromPrice.price / toPrice.price);
    } catch {
      setPythRate(null);
    } finally {
      setPythLoading(false);
    }
  };

  const loadQuote = async (): Promise<SwapQuote | null> => {
    const amountNumber = Number(fromAmount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      return null;
    }
    if (fromToken.asaId === toToken.asaId) {
      return null;
    }

    setSwapState("quoting");
    setQuoteError(null);

    try {
      const quoteData = await dartRouterService.fetchQuote(
        fromToken.asaId,
        toToken.asaId,
        toBaseUnits(amountNumber, fromToken.decimals),
      );

      setQuote(quoteData);
      setToAmount(shortAmount(fromBaseUnits(quoteData.quote, toToken.decimals), 6));
      setSwapState("idle");
      return quoteData;
    } catch (error: any) {
      const message = error?.message ?? "Failed to fetch quote";
      setQuote(null);
      setToAmount("");
      setQuoteError(message);
      setSwapState("failed");
      return null;
    }
  };

  const handleSwapDirection = () => {
    const oldFrom = fromToken;
    setFromToken(toToken);
    setToToken(oldFrom);
    setFromAmount("");
    setToAmount("");
    setQuote(null);
    setQuoteError(null);
    setExecutionError(null);
    setLastTxId(null);
    setSwapState("idle");
  };

  const openTokenSheet = (target: "from" | "to") => {
    setTokenSheetTarget(target);
    setTokenSearch("");
    tokenSheetRef.current?.present();
  };

  const selectToken = (nextToken: Token) => {
    if (tokenSheetTarget === "from") {
      if (nextToken.symbol === toToken.symbol) {
        setToToken(fromToken);
      }
      setFromToken(nextToken);
    } else {
      if (nextToken.symbol === fromToken.symbol) {
        setFromToken(toToken);
      }
      setToToken(nextToken);
    }

    tokenSheetRef.current?.dismiss();
    setFromAmount("");
    setToAmount("");
    setQuote(null);
    setQuoteError(null);
    setExecutionError(null);
    setLastTxId(null);
    setSwapState("idle");
  };

  const executeSwap = async () => {
    setExecutionError(null);

    const amountNumber = Number(fromAmount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setExecutionError("Enter a valid amount to swap.");
      setSwapState("failed");
      return;
    }

    if (fromToken.asaId === 0 && amountNumber > algoBalance) {
      setExecutionError("Insufficient ALGO balance.");
      setSwapState("failed");
      return;
    }

    let activeQuote = quote;
    if (!activeQuote) {
      activeQuote = await loadQuote();
    }

    if (!activeQuote) {
      setExecutionError("Quote unavailable. Try again.");
      setSwapState("failed");
      return;
    }

    try {
      setSwapState("routing");

      const routeName = activeQuote.route?.[0]?.path?.[0]?.name ?? "";
      const estimatedOnly = routeName === "oracle-estimate";

      setSwapState("awaiting_sign");

      if (estimatedOnly) {
        if (walletAddress) {
          await swapPortfolioStore.applySwap(
            walletAddress,
            {
              symbol: fromToken.symbol,
              asaId: fromToken.asaId,
              amount: amountNumber,
            },
            {
              symbol: toToken.symbol,
              asaId: toToken.asaId,
              amount: fromBaseUnits(activeQuote.quote, toToken.decimals),
            },
          );
          await refreshWalletSnapshots();
        }
        setLastTxId(null);
      } else {
        setSwapState("broadcasting");
        const executed = await dartRouterService.executeSwap(activeQuote, slippagePct);
        setLastTxId(executed.txId);

        if (walletAddress) {
          await swapPortfolioStore.applySwap(
            walletAddress,
            {
              symbol: fromToken.symbol,
              asaId: fromToken.asaId,
              amount: amountNumber,
            },
            {
              symbol: toToken.symbol,
              asaId: toToken.asaId,
              amount: fromBaseUnits(executed.amountOut, toToken.decimals),
            },
          );
        }

        await refreshWalletSnapshots();
      }

      setFromAmount("");
      setToAmount("");
      setQuote(null);
      setQuoteError(null);
      setSwapState("confirmed");

      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setSwapState("idle"), 2000);
    } catch (error: any) {
      setExecutionError(error?.message ?? "Swap failed. Please retry.");
      setSwapState("failed");
    }
  };

  const applySlippage = () => {
    const custom = Number(customSlippage);
    if (Number.isFinite(custom) && custom > 0) {
      setSlippagePct(custom);
    }
    slippageSheetRef.current?.dismiss();
  };

  const ctaPresentation = useMemo(() => {
    switch (swapState) {
      case "quoting":
        return { label: "Getting quote...", variant: "black" as const, loading: true };
      case "routing":
        return { label: "Routing via DART...", variant: "purple" as const, loading: true };
      case "awaiting_sign":
        return { label: "Sign Transaction", variant: "teal" as const, loading: false };
      case "broadcasting":
        return { label: "Broadcasting...", variant: "black" as const, loading: true };
      case "confirmed":
        return { label: "✓ Swapped", variant: "teal" as const, loading: false };
      case "failed":
        return { label: "Retry", variant: "black" as const, loading: false };
      case "idle":
      default:
        return { label: "Swap", variant: "black" as const, loading: false };
    }
  }, [swapState]);

  const isBusyState =
    swapState === "quoting" ||
    swapState === "routing" ||
    swapState === "awaiting_sign" ||
    swapState === "broadcasting";

  const canSubmit =
    !!fromAmount &&
    Number(fromAmount) > 0 &&
    fromToken.symbol !== toToken.symbol &&
    !isBusyState;

  const routeLabel = quote ? dartRouterService.formatRoute(quote) : "--";
  const fromUsdValue = Number(fromAmount || 0) * (pythRate ?? 0);
  const toUsdValue = Number(toAmount || 0);

  const filteredTokens = useMemo(() => {
    const query = tokenSearch.trim().toLowerCase();
    if (!query) return TOKENS;
    return TOKENS.filter(
      (token) =>
        token.symbol.toLowerCase().includes(query) ||
        token.name.toLowerCase().includes(query),
    );
  }, [tokenSearch]);

  if (isBootstrapping) {
    return (
      <ScreenContainer style={styles.loaderWrap}>
        <ActivityIndicator size="large" color={C.brand.black} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={styles.container} bottomInset={false}>
      <HeaderBar
        mode="title"
        title="Swap"
        onBackPress={() => router.back()}
        rightSlot={<Ionicons name="mail-outline" size={20} color={C.text.t1} />}
      />

      <View style={styles.body}>
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>⚡ DART Route Active</Text>
          <Text style={styles.bannerText}>Best price path found on Algorand</Text>
        </View>

        <View style={styles.slotCard}>
          <View style={styles.slotTopRow}>
            <View style={styles.slotTitleWrap}>
              <Text style={styles.slotLabel}>From ·</Text>
              <AssetChip symbol={fromToken.name} networkColor={fromToken.networkColor} />
            </View>
            <Text style={styles.balanceText}>${shortAmount(getTokenBalance(fromToken), 3)} bal</Text>
          </View>

          <View style={styles.slotMiddleRow}>
            <TouchableOpacity
              style={styles.tokenPill}
              activeOpacity={0.9}
              onPress={() => openTokenSheet("from")}
            >
              <Text style={styles.tokenPillText}>{fromToken.symbol}</Text>
              <Ionicons name="chevron-down" size={14} color={C.text.t1} />
            </TouchableOpacity>

            <TextInput
              value={fromAmount}
              onChangeText={(value) => {
                setFromAmount(parseAmountInput(value));
                setQuoteError(null);
                setExecutionError(null);
                setLastTxId(null);
              }}
              keyboardType="decimal-pad"
              placeholder="0.0"
              placeholderTextColor={C.text.tPh}
              style={styles.amountInput}
            />
          </View>

          <Text style={styles.usdLine}>{fromAmount ? `-${formatUsd(fromUsdValue)}` : "--"}</Text>
        </View>

        <View style={styles.swapDirectionWrap}>
          <TouchableOpacity
            style={styles.swapDirectionBtn}
            activeOpacity={0.9}
            onPress={handleSwapDirection}
          >
            <Text style={styles.swapDirectionText}>⇅</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.slotCard}>
          <View style={styles.slotTopRow}>
            <View style={styles.slotTitleWrap}>
              <Text style={styles.slotLabel}>To ·</Text>
              <AssetChip symbol={toToken.name} networkColor={toToken.networkColor} />
            </View>
            <Text style={styles.balanceText}>${shortAmount(getTokenBalance(toToken), 3)} bal</Text>
          </View>

          <View style={styles.slotMiddleRow}>
            <TouchableOpacity
              style={styles.tokenPill}
              activeOpacity={0.9}
              onPress={() => openTokenSheet("to")}
            >
              <Text style={styles.tokenPillText}>{toToken.symbol}</Text>
              <Ionicons name="chevron-down" size={14} color={C.text.t1} />
            </TouchableOpacity>

            <TextInput
              value={toAmount}
              editable={false}
              placeholder="0.0"
              placeholderTextColor={C.text.tPh}
              style={[styles.amountInput, styles.toAmountInput]}
            />
          </View>

          <Text style={styles.usdLine}>{toAmount ? `-${formatUsd(toUsdValue)}` : "--"}</Text>
        </View>

        <View style={styles.priceRow}>
          <Text style={styles.priceRowText}>
            {pythRate ? `1 ${fromToken.symbol} = ${shortAmount(pythRate, 6)} ${toToken.symbol}` : "Price unavailable"}
          </Text>
          <LiveBadge isLoading={pythLoading || swapState === "quoting"} />
        </View>

        <View style={styles.detailsWrap}>
          <TouchableOpacity
            style={styles.detailsHeader}
            activeOpacity={0.9}
            onPress={() => setDetailsOpen((prev) => !prev)}
          >
            <Text style={styles.detailsTitle}>Details</Text>
            <Ionicons
              name={detailsOpen ? "chevron-up" : "chevron-down"}
              size={16}
              color={C.text.t2}
            />
          </TouchableOpacity>

          {detailsOpen ? (
            <View style={styles.detailsBody}>
              <View style={styles.detailsRow}>
                <Text style={styles.detailsKey}>Slippage</Text>
                <TouchableOpacity
                  onPress={() => slippageSheetRef.current?.present()}
                  style={styles.detailAction}
                  activeOpacity={0.9}
                >
                  <Text style={styles.detailsValue}>{slippagePct.toFixed(2)}%</Text>
                  <Text style={styles.detailEdit}>Edit</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.detailsRow}>
                <Text style={styles.detailsKey}>Network fee</Text>
                <Text style={styles.detailsValue}>~0.001 ALGO</Text>
              </View>

              <View style={styles.detailsRow}>
                <Text style={styles.detailsKey}>Route</Text>
                <Text style={styles.detailsValueRoute}>{routeLabel}</Text>
              </View>

              <View style={styles.detailsRow}>
                <Text style={styles.detailsKey}>DART App ID</Text>
                <Text style={styles.detailsMono}>{DART_APP_ID}</Text>
              </View>

              {lastTxId ? (
                <View style={styles.detailsRow}>
                  <Text style={styles.detailsKey}>Last Tx</Text>
                  <Text style={styles.detailsMono}>{`${lastTxId.slice(0, 10)}...${lastTxId.slice(-8)}`}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {quoteError ? <Text style={styles.errorText}>{quoteError}</Text> : null}
        {executionError ? <Text style={styles.errorText}>{executionError}</Text> : null}
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          label={ctaPresentation.label}
          variant={ctaPresentation.variant}
          loading={ctaPresentation.loading}
          disabled={!canSubmit && swapState !== "failed"}
          style={swapState === "failed" ? styles.ctaFailed : swapState === "confirmed" ? styles.ctaConfirmed : undefined}
          onPress={() => {
            void executeSwap();
          }}
        />
      </View>

      <CrescaSheet
        sheetRef={tokenSheetRef}
        snapPoints={["85%"]}
        title="Select Token"
      >
        <CrescaInput
          value={tokenSearch}
          onChangeText={setTokenSearch}
          placeholder="Search token"
          containerStyle={styles.searchInputWrap}
        />

        <FlatList
          data={filteredTokens}
          keyExtractor={(item) => `${item.symbol}-${item.asaId}`}
          contentContainerStyle={styles.tokenListContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.tokenRow}
              activeOpacity={0.9}
              onPress={() => selectToken(item)}
            >
              <View style={[styles.tokenDot, { backgroundColor: item.networkColor }]} />
              <View style={styles.tokenMeta}>
                <Text style={styles.tokenRowName}>{item.name}</Text>
                <Text style={styles.tokenRowSymbol}>{item.symbol}</Text>
              </View>
              <Text style={styles.tokenRowBalance}>{shortAmount(getTokenBalance(item), 6)}</Text>
            </TouchableOpacity>
          )}
        />
      </CrescaSheet>

      <CrescaSheet
        sheetRef={slippageSheetRef}
        snapPoints={["50%"]}
        title="Slippage Tolerance"
      >
        <View style={styles.slippagePillsRow}>
          {[0.1, 0.5, 1.0].map((value) => {
            const selected = Math.abs(slippagePct - value) < 0.0001;
            return (
              <TouchableOpacity
                key={value}
                style={[styles.slippagePill, selected && styles.slippagePillActive]}
                onPress={() => {
                  setSlippagePct(value);
                  setCustomSlippage("");
                }}
                activeOpacity={0.9}
              >
                <Text style={[styles.slippagePillText, selected && styles.slippagePillTextActive]}>
                  {value}%
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <CrescaInput
          label="Custom"
          value={customSlippage}
          onChangeText={(value) => setCustomSlippage(parseAmountInput(value))}
          keyboardType="decimal-pad"
          placeholder="0.50"
        />

        <PrimaryButton label="Save" variant="black" onPress={applySlippage} style={styles.slippageSaveBtn} />
      </CrescaSheet>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.surfaces.bgBase,
  },
  loaderWrap: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: C.surfaces.bgBase,
  },
  body: {
    flex: 1,
    paddingHorizontal: H_PAD,
    paddingTop: 12,
  },
  banner: {
    backgroundColor: "rgba(110,86,207,0.08)",
    borderRadius: R.sm,
    padding: 12,
    marginBottom: 12,
  },
  bannerTitle: {
    ...T.smBold,
    color: C.brand.purple,
  },
  bannerText: {
    ...T.sm,
    color: C.text.t2,
    marginTop: 2,
  },
  slotCard: {
    backgroundColor: C.surfaces.bgSurface,
    borderRadius: R.md,
    padding: 16,
  },
  slotTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  slotTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  slotLabel: {
    ...T.sm,
    color: C.text.t2,
  },
  balanceText: {
    ...T.sm,
    color: C.text.t2,
  },
  slotMiddleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  tokenPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.surfaces.bgBase,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    borderRadius: R.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tokenPillText: {
    ...T.bodyMd,
    color: C.text.t1,
  },
  amountInput: {
    flex: 1,
    textAlign: "right",
    color: C.text.t1,
    ...T.display,
  },
  toAmountInput: {
    color: C.text.t2,
  },
  usdLine: {
    ...T.sm,
    color: C.text.t2,
    textAlign: "right",
    marginTop: 4,
  },
  swapDirectionWrap: {
    alignItems: "center",
    marginVertical: 8,
  },
  swapDirectionBtn: {
    width: 40,
    height: 40,
    borderRadius: R.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaces.bgSurface,
    borderWidth: 1,
    borderColor: C.borders.bStrong,
  },
  swapDirectionText: {
    ...T.bodyMd,
    color: C.text.t1,
  },
  priceRow: {
    marginTop: 10,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  priceRowText: {
    ...T.sm,
    color: C.text.t2,
  },
  detailsWrap: {
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    backgroundColor: C.surfaces.bgBase,
    overflow: "hidden",
  },
  detailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  detailsTitle: {
    ...T.smBold,
    color: C.text.t1,
  },
  detailsBody: {
    borderTopWidth: 1,
    borderTopColor: C.borders.bDefault,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  detailsKey: {
    ...T.sm,
    color: C.text.t2,
  },
  detailsValue: {
    ...T.smBold,
    color: C.text.t1,
  },
  detailsValueRoute: {
    ...T.sm,
    color: C.text.t1,
    flex: 1,
    textAlign: "right",
  },
  detailsMono: {
    ...T.address,
    color: C.text.t2,
  },
  detailAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailEdit: {
    ...T.smBold,
    color: C.brand.purple,
  },
  errorText: {
    ...T.sm,
    color: C.semantic.danger,
    marginTop: 8,
  },
  footer: {
    paddingHorizontal: H_PAD,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: C.borders.bDefault,
    backgroundColor: C.surfaces.bgBase,
  },
  ctaConfirmed: {
    backgroundColor: C.semantic.success,
    borderColor: C.semantic.success,
  },
  ctaFailed: {
    backgroundColor: C.semantic.danger,
    borderColor: C.semantic.danger,
  },
  searchInputWrap: {
    marginBottom: 8,
  },
  tokenListContent: {
    paddingBottom: 30,
  },
  tokenRow: {
    height: 64,
    borderBottomWidth: 1,
    borderBottomColor: C.borders.bDefault,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tokenDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  tokenMeta: {
    flex: 1,
  },
  tokenRowName: {
    ...T.bodyMd,
    color: C.text.t1,
  },
  tokenRowSymbol: {
    ...T.sm,
    color: C.text.t2,
    marginTop: 2,
  },
  tokenRowBalance: {
    ...T.sm,
    color: C.text.t2,
  },
  slippagePillsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  slippagePill: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    borderRadius: R.full,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    backgroundColor: C.surfaces.bgSurface,
  },
  slippagePillActive: {
    backgroundColor: C.brand.black,
    borderColor: C.brand.black,
  },
  slippagePillText: {
    ...T.bodyMd,
    color: C.text.t1,
  },
  slippagePillTextActive: {
    color: C.text.tInv,
  },
  slippageSaveBtn: {
    marginTop: 12,
  },
});
