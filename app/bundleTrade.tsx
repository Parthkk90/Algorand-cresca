import { InformationCircleIcon, ArrowUp01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Linking,
  PanResponder,
  LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { ScreenContainer } from "../components/ScreenContainer";
import {
  BASKETS,
  Basket,
  BasketAsset,
  basketToContractArgs,
  getBasket,
} from "../constants/baskets";
import {
  CONTRACT_APP_IDS,
  DEFAULT_LEVERAGE,
  ORACLE_SCALE,
  CONFIRM_RESET_DELAY_MS,
  explorerAppUrl,
} from "../constants/config";
import { crescaBucketService } from "../services/algorandContractServices";
import { algorandService } from "../services/algorandService";
import { dartRouterService } from "../services/dartRouterService";
import { positionStore } from "../services/positionStore";
import { pythOracleService } from "../services/pythOracleService";
import {
  AssetChip,
  CrescaInput,
  CrescaSheet,
  HeaderBar,
  IconWrapper,
  PrimaryButton,
  StatusTag,
} from "../src/components/ui";
import { C, H_PAD, R, T } from "../src/theme";

const BUNDLE_PROTOCOL_APP_ID = CONTRACT_APP_IDS.CrescaBucketProtocol;

type TradeAction = "long" | "short";
type TradeState =
  | "idle"
  | "confirming"
  | "sign"
  | "broadcasting"
  | "confirmed"
  | "failed";

type ParsedParams = {
  bundleId?: string;
  bundleName?: string;
  assets?: string;
  totalValue?: string;
};

function parseNumericInput(raw: string): string {
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

function formatUsd(amount: number): string {
  if (!Number.isFinite(amount)) return "$0.00";
  if (amount >= 1000) return `$${amount.toFixed(2)}`;
  if (amount >= 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(4)}`;
}

function shortValue(value: number, fraction = 4): string {
  if (!Number.isFinite(value)) return "0";
  return value
    .toFixed(fraction)
    .replace(/\.0+$/, "")
    .replace(/(\.[0-9]*?)0+$/, "$1");
}

function pickBundle(params: ParsedParams): Basket {
  const byId = params.bundleId ? getBasket(params.bundleId) : undefined;
  return byId ?? BASKETS[0];
}

function parseAssetsParam(assetsRaw: string | undefined, fallback: BasketAsset[]): BasketAsset[] {
  if (!assetsRaw) return fallback;

  try {
    const parsed = JSON.parse(assetsRaw) as (| string
      | {
        symbol?: string;
        weight?: number;
        asaId?: number;
      })[];

    if (!Array.isArray(parsed) || parsed.length === 0) return fallback;

    const fallbackBySymbol = fallback.reduce((acc, asset) => {
      acc[asset.symbol] = asset;
      return acc;
    }, {} as Record<string, BasketAsset>);

    const normalized = parsed
      .map((entry) => {
        if (typeof entry === "string") {
          return fallbackBySymbol[entry.toUpperCase()] ?? null;
        }
        const symbol = String(entry.symbol ?? "").toUpperCase();
        if (!symbol) return null;
        const fallbackAsset = fallbackBySymbol[symbol];
        return {
          symbol,
          asaId: Number(entry.asaId ?? fallbackAsset?.asaId ?? 0),
          weight: Number(entry.weight ?? fallbackAsset?.weight ?? 0),
        } as BasketAsset;
      })
      .filter((asset): asset is BasketAsset => !!asset);

    if (normalized.length > 0) {
      const sum = normalized.reduce((acc, asset) => acc + asset.weight, 0);
      if (sum > 0 && sum !== 100) {
        return normalized.map((asset) => ({
          ...asset,
          weight: Math.round((asset.weight / sum) * 100),
        }));
      }
      return normalized;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export default function BundleTradeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<ParsedParams>();

  const baseBundle = pickBundle(params);
  const assets = useMemo(
    () => parseAssetsParam(params.assets, baseBundle.assets),
    [params.assets, baseBundle.assets],
  );

  const bundleName = params.bundleName || baseBundle.name;
  const totalValue = Number(params.totalValue ?? 420) || 420;
  const basketId = baseBundle.id;

  const { asaIds, weights } = useMemo(
    () => basketToContractArgs({ ...baseBundle, assets }),
    [baseBundle, assets],
  );
  const symbols = useMemo(() => assets.map((asset) => asset.symbol), [assets]);

  const detailSheetRef = useRef<BottomSheetModal | null>(null);
  const confirmSheetRef = useRef<BottomSheetModal | null>(null);

  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [algoAvailable, setAlgoAvailable] = useState(0);

  // Input is denominated in ALGO. USD-equivalent figures are derived for
  // display only (per-asset slice, confirm sheet total, etc.).
  const [amountAlgo, setAmountAlgo] = useState("");
  const minLeverage = 1;
  const maxLeverage = 20;
  const [leverage, setLeverage] = useState<number>(
    Math.min(Math.max(DEFAULT_LEVERAGE, minLeverage), maxLeverage),
  );
  const [action, setAction] = useState<TradeAction>("long");
  const [tradeState, setTradeState] = useState<TradeState>("idle");

  const [allocationOpen, setAllocationOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastTxId, setLastTxId] = useState<string | null>(null);

  const [usdPrices, setUsdPrices] = useState<Record<string, number>>({});
  const [algoUsd, setAlgoUsd] = useState<number | null>(null);
  const [bucketId, setBucketId] = useState<number | null>(null);

  const [toggleWidth, setToggleWidth] = useState(0);
  const toggleX = useSharedValue(0);

  useEffect(() => {
    toggleX.value = withTiming(action === "long" ? 0 : toggleWidth / 2, { duration: 200 });
  }, [action, toggleWidth, toggleX]);

  const toggleAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: toggleX.value }],
  }));

  // Slider refs for leverage control (0x - 20x)
  const sliderWidthRef = useRef(0);
  const sliderPageXRef = useRef(0);
  const sliderRef = useRef<View | null>(null);
  const panX = useRef(new Animated.Value(0)).current;
  const leverageRange = maxLeverage - minLeverage;

  const updateLeverageFromPageX = useCallback((pageX: number) => {
    const width = sliderWidthRef.current || 1;
    const localX = pageX - sliderPageXRef.current;
    const clamped = Math.max(0, Math.min(width, localX));
    const ratio = clamped / width;
    const value = Math.round(minLeverage + ratio * leverageRange);
    setLeverage(value);
    panX.setValue(clamped);
  }, [leverageRange, minLeverage, panX]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_, gestureState) => {
        sliderRef.current?.measureInWindow((x) => {
          sliderPageXRef.current = x;
          updateLeverageFromPageX(gestureState.x0);
        });
      },
      onPanResponderMove: (_, gestureState) => {
        updateLeverageFromPageX(gestureState.moveX);
      },
    }),
  ).current;

  const onSliderLayout = (e: LayoutChangeEvent) => {
    sliderWidthRef.current = e.nativeEvent.layout.width;
    // position initial panX according to current leverage
    const width = sliderWidthRef.current || 1;
    const ratio = leverageRange > 0
      ? (leverage - minLeverage) / leverageRange
      : 0;
    const initial = ratio * width;
    panX.setValue(initial);
  };

  const initialize = useCallback(async () => {
    setIsBootstrapping(true);
    try {
      await algorandService.initializeWallet();

      const [{ availableAlgo }, prices, algoPrice] = await Promise.all([
        algorandService.getBalance(),
        pythOracleService.getPrices(symbols),
        pythOracleService.getPrice("ALGO"),
      ]);

      const usdMap: Record<string, number> = {};
      Object.entries(prices).forEach(([symbol, payload]) => {
        usdMap[symbol] = payload.price;
      });

      setUsdPrices(usdMap);
      setAlgoUsd(algoPrice?.price ?? null);
      setAlgoAvailable(Number(availableAlgo));
    } catch (e: any) {
      setError(e?.message ?? "Failed to initialize bundle trade screen");
    } finally {
      setIsBootstrapping(false);
    }
  }, [symbols]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const parsedAmountAlgo = Number(amountAlgo);
  const marginAlgo = Number.isFinite(parsedAmountAlgo) && parsedAmountAlgo > 0
    ? parsedAmountAlgo
    : 0;
  // USD-equivalent for downstream display / per-asset slicing.
  const safeAmountUsdc = algoUsd && algoUsd > 0 ? marginAlgo * algoUsd : 0;

  const estimatedAssets = useMemo(() => {
    if (safeAmountUsdc <= 0) return [];

    return assets.map((asset) => {
      const usdPrice = usdPrices[asset.symbol] ?? 0;
      const usdSlice = (safeAmountUsdc * asset.weight) / 100;
      const units = usdPrice > 0 ? usdSlice / usdPrice : 0;
      return {
        ...asset,
        usdPrice,
        usdSlice,
        units,
      };
    });
  }, [assets, safeAmountUsdc, usdPrices]);

  const cta = useMemo(() => {
    switch (tradeState) {
      case "confirming":
        return { label: "Confirming...", loading: false };
      case "sign":
        return { label: "Sign Transaction", loading: false };
      case "broadcasting":
        return { label: "Broadcasting...", loading: true };
      case "confirmed":
        return { label: "✓ Confirmed", loading: false };
      case "failed":
        return { label: "Retry", loading: false };
      case "idle":
      default:
        return { label: "Execute Trade", loading: false };
    }
  }, [tradeState, action]);

  const canProceed =
    !isBootstrapping &&
    marginAlgo > 0 &&
    marginAlgo <= algoAvailable;

  const priceImpactLabel = "< 0.1%";
  const atomicSize = `${assets.length} / 16`;

  const openConfirmSheet = () => {
    setError(null);

    if (marginAlgo <= 0) {
      setError("Enter a valid ALGO amount.");
      setTradeState("failed");
      return;
    }

    if (marginAlgo > algoAvailable) {
      setError(
        `Need ${marginAlgo.toFixed(4)} ALGO but only ${algoAvailable.toFixed(4)} ALGO is spendable.`,
      );
      setTradeState("failed");
      return;
    }

    setTradeState("confirming");
    confirmSheetRef.current?.present();
  };

  // Re-entry guard. tradeState updates are async; a fast double-tap can
  // fire executeTrade twice before the first call has flipped state to
  // "sign". A ref check is synchronous and blocks the duplicate run.
  const tradeInFlight = useRef(false);

  const executeTrade = async () => {
    if (tradeInFlight.current) {
      console.warn("⏸  Trade already in flight — ignoring duplicate Confirm tap");
      return;
    }
    tradeInFlight.current = true;
    setError(null);

    try {
      setTradeState("sign");

      const oraclePriceMap = await dartRouterService.getOraclePrices(asaIds);
      const oracleIds = Array.from(oraclePriceMap.keys());
      const oracleValues = oracleIds.map((id) => oraclePriceMap.get(id) ?? ORACLE_SCALE);
      await crescaBucketService.updateOracle(oracleIds, oracleValues);

      setTradeState("broadcasting");

      // Top up collateral ONLY if existing balance can't cover this trade.
      // Previously this re-deposited `marginAlgo` on every trade, double-
      // funding the contract (once via the bucket screen, again per trade)
      // and draining the wallet.
      const currentCollateralAlgo = Number(
        await crescaBucketService.getCollateralBalance(algorandService.getAddress()),
      );
      if (currentCollateralAlgo + 1e-6 < marginAlgo) {
        const shortfall = marginAlgo - currentCollateralAlgo;
        await crescaBucketService.depositCollateral(shortfall);
      }

      let currentBucketId = bucketId;
      if (currentBucketId === null) {
        const useLev = Math.min(Math.max(Math.round(leverage), minLeverage), maxLeverage);
        const created = await crescaBucketService.createBucket(asaIds, weights, useLev);
        currentBucketId = created.bucketId;
        setBucketId(created.bucketId);
      }

      const opened = await crescaBucketService.openPosition(
        currentBucketId,
        action === "long",
        marginAlgo,
        asaIds,
      );

      setLastTxId(opened.txId);

      await positionStore.add({
        positionId: opened.positionId,
        bucketId: currentBucketId,
        appId: CONTRACT_APP_IDS.CrescaBucketProtocol,
        basketId,
        asaIds,
        leverage: Math.min(Math.max(Math.round(leverage), minLeverage), maxLeverage),
        marginAlgo,
        openedAt: Date.now(),
        txId: opened.txId,
      });

      confirmSheetRef.current?.dismiss();
      setTradeState("confirmed");
      setAmountAlgo("");

      const { availableAlgo } = await algorandService.getBalance();
      setAlgoAvailable(Number(availableAlgo));

      setTimeout(() => {
        setTradeState("idle");
      }, CONFIRM_RESET_DELAY_MS);
    } catch (e: any) {
      setError(e?.message ?? "Trade execution failed.");
      setTradeState("failed");
    } finally {
      tradeInFlight.current = false;
    }
  };

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
        title={bundleName}
        onBackPress={() => router.back()}
        rightSlot={
          <TouchableOpacity
            onPress={() => detailSheetRef.current?.present()}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Open bundle details"
          >
            <IconWrapper icon={InformationCircleIcon} size={20} color={C.text.t1} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.compositionCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardMutedLabel}>Bundle</Text>
            <Text style={styles.cardAssetCount}>{assets.length} assets</Text>
          </View>

          <View style={styles.assetChipsWrap}>
            {assets.map((asset) => (
              <AssetChip
                key={`${asset.asaId}-${asset.symbol}`}
                symbol={asset.symbol}
                networkColor={
                  asset.symbol === "ALGO"
                    ? C.networks.algorand
                    : asset.symbol === "BTC"
                      ? C.networks.bitcoin
                      : C.networks.ethereum
                }
              />
            ))}
          </View>

          <View style={[styles.rowBetween, styles.totalValueRow]}>
            <Text style={styles.totalValueText}>Total value: {formatUsd(totalValue)}</Text>
            <TouchableOpacity
              style={styles.allocToggleBtn}
              onPress={() => setAllocationOpen((prev) => !prev)}
              activeOpacity={0.9}
            >
              <IconWrapper
                icon={allocationOpen ? ArrowUp01Icon : ArrowRight01Icon}
                size={16}
                color={C.text.t2}
              />
            </TouchableOpacity>
          </View>

          {allocationOpen ? (
            <FlatList
              data={assets}
              keyExtractor={(item) => `${item.symbol}-${item.asaId}`}
              scrollEnabled={false}
              contentContainerStyle={styles.allocationList}
              renderItem={({ item }) => {
                const usdSlice = (safeAmountUsdc * item.weight) / 100;
                return (
                  <View style={styles.allocationRow}>
                    <View style={styles.allocationTop}>
                      <AssetChip symbol={item.symbol} />
                      <Text style={styles.allocationPct}>{item.weight}%</Text>
                      <Text style={styles.allocationUsd}>{formatUsd(usdSlice)}</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${item.weight}%` }]} />
                    </View>
                  </View>
                );
              }}
            />
          ) : null}
        </View>

        <View
          style={styles.toggleWrap}
          onLayout={(event) => {
            setToggleWidth(event.nativeEvent.layout.width);
          }}
        >
          <Reanimated.View
            pointerEvents="none"
            style={[
              styles.toggleIndicator,
              { width: toggleWidth / 2 },
              toggleAnimatedStyle,
            ]}
          />
          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={() => setAction("long")}
            activeOpacity={0.9}
          >
            <Text style={[styles.toggleText, action === "long" && styles.toggleTextActive]}>Long</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={() => setAction("short")}
            activeOpacity={0.9}
          >
            <Text style={[styles.toggleText, action === "short" && styles.toggleTextActive]}>Short</Text>
          </TouchableOpacity>
        </View>

        {/* Leverage slider (0x - 20x) */}
        <View style={styles.leverageWrap}>
          <Text style={styles.leverageLabel}>Leverage: {leverage}×</Text>
          <View
            ref={sliderRef}
            style={styles.leverageTrack}
            onLayout={onSliderLayout}
            {...panResponder.panHandlers}
          >
            <Animated.View style={[styles.leverageFill, { width: (panX as any) }]} />
            <Animated.View style={[styles.leverageHandle, { transform: [{ translateX: (panX as any) }] }]} {...panResponder.panHandlers} />
          </View>
          <View style={styles.leverageLabelsRow}>
            <Text style={styles.leverageMin}>1x</Text>
            <Text style={styles.leverageMax}>20x</Text>
          </View>
        </View>

        <View style={styles.amountWrap}>
          <CrescaInput
            label={
              algoUsd && algoUsd > 0
                ? `Margin (ALGO)  ·  ≈ ${formatUsd(safeAmountUsdc)} at current price`
                : "Margin (ALGO)"
            }
            value={amountAlgo}
            onChangeText={(value) => {
              setAmountAlgo(parseNumericInput(value));
              setError(null);
              if (tradeState === "failed") setTradeState("idle");
            }}
            keyboardType="decimal-pad"
            placeholder="0.000000"
            inputStyle={styles.amountInput}
          />
          <View style={styles.amountMetaRow}>
            <Text style={styles.amountMetaText}>
              Max: {shortValue(algoAvailable, 6)} ALGO
            </Text>
            <TouchableOpacity
              style={styles.maxBtn}
              onPress={() => {
                // Leave a small buffer for fees + a per-tx 0.005 ALGO safety pad.
                const safe = Math.max(algoAvailable - 0.005, 0);
                setAmountAlgo(safe > 0 ? safe.toFixed(6) : "");
                setError(null);
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.maxBtnText}>Max</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.amountMetaHint}>
            Locks {shortValue(marginAlgo, 6)} ALGO of collateral · Available: {shortValue(algoAvailable, 6)} ALGO
          </Text>
        </View>

        {/* Bundle size removed per request */}

        <View style={styles.tagsRow}>
          <StatusTag label={`Leverage: ${leverage}×`} variant="warning" />
          <StatusTag label="Risk: Medium" variant="warning" />
          <StatusTag label="Protocol: Cresca" variant="purple" />
        </View>

        <Text style={styles.priceImpactText}>Price impact: {priceImpactLabel}</Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        {(() => {
          const isDisabled = !canProceed && tradeState !== "failed";
          return (
            <PrimaryButton
              label={cta.label}
              loading={cta.loading}
              variant="black"
              disabled={isDisabled}
              onPress={openConfirmSheet}
              style={[
                // Action-colour the CTA only when it can actually be pressed,
                // so the disabled state stays uniformly grey.
                !isDisabled && action === "long" && styles.buyCta,
                !isDisabled && action === "short" && styles.sellCta,
                tradeState === "confirmed" && styles.confirmedCta,
              ]}
            />
          );
        })()}
      </View>

      <CrescaSheet
        sheetRef={detailSheetRef}
        snapPoints={["85%"]}
        title={bundleName}
      >
        <Text style={styles.sheetSubTitle}>Bundle composition</Text>

        <FlatList
          data={assets}
          keyExtractor={(item) => `detail-${item.symbol}-${item.asaId}`}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={styles.detailAssetRow}>
              <AssetChip symbol={item.symbol} />
              <Text style={styles.detailWeight}>{item.weight}%</Text>
              <Text style={styles.detailPrice}>{formatUsd(usdPrices[item.symbol] ?? 0)}</Text>
            </View>
          )}
        />

        <View style={styles.sheetDivider} />

        <Text style={styles.contractMono}>
          Bundle Protocol · App ID: {BUNDLE_PROTOCOL_APP_ID}
        </Text>
        <Text style={styles.contractMono}>
          Creation Hash: {lastTxId ? `${lastTxId.slice(0, 10)}...${lastTxId.slice(-8)}` : "4MBAKECM7X..."}
        </Text>

        <TouchableOpacity
          onPress={() =>
            Linking.openURL(explorerAppUrl(BUNDLE_PROTOCOL_APP_ID))
          }
          activeOpacity={0.9}
          style={styles.explorerLinkBtn}
        >
          <Text style={styles.explorerLink}>Open on Algorand Explorer</Text>
        </TouchableOpacity>
      </CrescaSheet>

      <CrescaSheet
        sheetRef={confirmSheetRef}
        snapPoints={["60%"]}
        title="Confirm Trade"
      >
        <View style={styles.confirmList}>
          <View style={styles.confirmRow}>
            <Text style={styles.confirmKey}>Action</Text>
            <Text style={styles.confirmValue}>{action === "long" ? "Long" : "Short"}</Text>
          </View>
          <View style={styles.confirmRow}>
            <Text style={styles.confirmKey}>Bundle</Text>
            <Text style={styles.confirmValue}>{bundleName}</Text>
          </View>
          <View style={styles.confirmRow}>
            <Text style={styles.confirmKey}>Margin</Text>
            <Text style={styles.confirmValue}>
              {shortValue(marginAlgo, 6)} ALGO
              {algoUsd && algoUsd > 0 ? `  (≈ ${formatUsd(safeAmountUsdc)})` : ""}
            </Text>
          </View>
          <View style={styles.confirmRow}>
            <Text style={styles.confirmKey}>Est. received</Text>
            <Text style={styles.confirmValue}>
              {estimatedAssets
                .map((asset) => `${shortValue(asset.units, 4)} ${asset.symbol}`)
                .join(" · ")}
            </Text>
          </View>
          <View style={styles.confirmRow}>
            <Text style={styles.confirmKey}>Gas</Text>
            <Text style={styles.confirmValue}>~0.001 ALGO</Text>
          </View>
        </View>

        <PrimaryButton
          label="Confirm & Sign"
          variant="teal"
          loading={tradeState === "sign" || tradeState === "broadcasting"}
          // Hard-disable while a trade is mid-flight so a double-tap or
          // strict-mode re-render can't fire executeTrade twice. Two parallel
          // runs race on collateral reads → second deposit duplicates the
          // first, and the second open_position reads stale collateral and
          // fails the "Insufficient collateral" assertion.
          disabled={
            tradeState === "sign" ||
            tradeState === "broadcasting" ||
            tradeState === "confirmed"
          }
          onPress={() => {
            void executeTrade();
          }}
          style={styles.confirmCta}
        />

        <TouchableOpacity
          onPress={() => {
            confirmSheetRef.current?.dismiss();
            if (tradeState === "confirming") setTradeState("idle");
          }}
          activeOpacity={0.9}
          style={styles.cancelBtn}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
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
  content: {
    paddingHorizontal: H_PAD,
    paddingTop: 16,
    paddingBottom: 24,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  compositionCard: {
    backgroundColor: C.surfaces.bgSurface,
    borderRadius: R.lg,
    padding: 16,
  },
  cardMutedLabel: {
    ...T.sm,
    color: C.text.t2,
  },
  cardAssetCount: {
    ...T.smBold,
    color: C.text.t1,
  },
  assetChipsWrap: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  totalValueRow: {
    marginTop: 12,
  },
  totalValueText: {
    ...T.bodyMd,
    color: C.text.t1,
  },
  allocToggleBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: R.full,
    backgroundColor: C.surfaces.bgBase,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
  },
  allocationList: {
    marginTop: 10,
    gap: 10,
  },
  allocationRow: {
    gap: 6,
  },
  allocationTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  allocationPct: {
    ...T.smBold,
    color: C.text.t1,
  },
  allocationUsd: {
    ...T.sm,
    color: C.text.t2,
    marginLeft: "auto",
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: C.borders.bDefault,
    overflow: "hidden",
  },
  barFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: C.brand.teal,
  },
  toggleWrap: {
    marginTop: 16,
    flexDirection: "row",
    borderRadius: R.full,
    backgroundColor: C.surfaces.bgSurface,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    overflow: "hidden",
    position: "relative",
  },
  toggleIndicator: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: C.brand.black,
    borderRadius: R.full,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleText: {
    ...T.bodyMd,
    color: C.text.t2,
    zIndex: 1,
  },
  toggleTextActive: {
    color: C.text.tInv,
  },
  leverageWrap: {
    marginTop: 12,
  },
  leverageLabel: {
    ...T.smBold,
    color: C.text.t1,
    marginBottom: 8,
  },
  leverageTrack: {
    height: 36,
    backgroundColor: C.surfaces.bgBase,
    borderRadius: 18,
    overflow: "hidden",
    justifyContent: "center",
  },
  leverageFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: C.brand.teal,
  },
  leverageHandle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.surfaces.bgSurface,
    borderWidth: 2,
    borderColor: C.brand.black,
    position: "absolute",
    top: 4,
  },
  leverageLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  leverageMin: {
    ...T.sm,
    color: C.text.t2,
  },
  leverageMax: {
    ...T.sm,
    color: C.text.t2,
  },
  amountWrap: {
    marginTop: 12,
  },
  amountInput: {
    ...T.h1,
    textAlign: "right",
    color: C.text.t1,
  },
  amountMetaRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  amountMetaText: {
    ...T.sm,
    color: C.text.t2,
  },
  amountMetaHint: {
    ...T.sm,
    color: C.text.t2,
    marginTop: 6,
  },
  maxBtn: {
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: C.brand.teal,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  maxBtnText: {
    ...T.smBold,
    color: C.brand.teal,
  },
  atomicBadge: {
    marginTop: 12,
    borderRadius: R.sm,
    padding: 10,
    backgroundColor: "rgba(0,212,170,0.08)",
    flexDirection: "row",
    alignItems: "center",
  },
  atomicText: {
    ...T.sm,
    color: C.text.t1,
  },
  atomicNumbers: {
    ...T.smBold,
    color: C.brand.teal,
  },
  tagsRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  priceImpactText: {
    ...T.sm,
    color: C.semantic.success,
    marginTop: 10,
  },
  errorText: {
    ...T.sm,
    color: C.semantic.danger,
    marginTop: 8,
  },
  footer: {
    paddingHorizontal: H_PAD,
    paddingVertical: 16,
    marginBottom: 96,
    borderTopWidth: 1,
    borderTopColor: C.borders.bDefault,
    backgroundColor: C.surfaces.bgBase,
  },
  buyCta: {
    backgroundColor: C.semantic.success,
    borderColor: C.semantic.success,
  },
  sellCta: {
    backgroundColor: C.semantic.danger,
    borderColor: C.semantic.danger,
  },
  confirmedCta: {
    backgroundColor: C.semantic.success,
    borderColor: C.semantic.success,
  },
  sheetSubTitle: {
    ...T.sm,
    color: C.text.t2,
    marginBottom: 8,
  },
  detailAssetRow: {
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: C.borders.bDefault,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailWeight: {
    ...T.smBold,
    color: C.text.t1,
  },
  detailPrice: {
    ...T.sm,
    color: C.text.t2,
    marginLeft: "auto",
  },
  sheetDivider: {
    borderBottomWidth: 1,
    borderBottomColor: C.borders.bDefault,
    marginVertical: 12,
  },
  contractMono: {
    ...T.address,
    color: C.text.t2,
    marginBottom: 6,
  },
  explorerLinkBtn: {
    marginTop: 6,
  },
  explorerLink: {
    ...T.smBold,
    color: C.brand.teal,
  },
  confirmList: {
    gap: 10,
  },
  confirmRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  confirmKey: {
    ...T.sm,
    color: C.text.t2,
  },
  confirmValue: {
    ...T.smBold,
    color: C.text.t1,
    flex: 1,
    textAlign: "right",
  },
  confirmCta: {
    marginTop: 16,
  },
  cancelBtn: {
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    ...T.bodyMd,
    color: C.brand.teal,
  },
});
