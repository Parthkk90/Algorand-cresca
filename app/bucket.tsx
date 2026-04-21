import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ScreenContainer } from "../components/ScreenContainer";
import { BASKETS } from "../constants/baskets";
import { CONTRACT_APP_IDS, crescaBucketService } from "../services/algorandContractServices";
import { algorandService } from "../services/algorandService";
import { dartRouterService } from "../services/dartRouterService";
import { positionStore, StoredPosition } from "../services/positionStore";
import {
  AssetChip,
  CrescaInput,
  CrescaSheet,
  PrimaryButton,
  StatusTag,
} from "../src/components/ui";
import { C, H_PAD, R, S, T } from "../src/theme";

type PositionModel = {
  position: StoredPosition;
  symbols: string[];
  depositedAlgo: number;
  currentAlgo: number;
  pnlAlgo: number;
};

type TxType = "open" | "deposit" | "withdraw" | "close" | "bucket_create";

type TxRow = {
  txId: string;
  type: TxType;
  timestamp: number;
  amountAlgo?: number;
};

type PendingAction = "deposit" | "withdraw" | "create" | "close" | null;

const DEPOSIT_ASSET_OPTIONS = ["ALGO", "USDC", "ETH"] as const;
const WITHDRAW_OPTIONS = [25, 50, 75, 100] as const;
const DEFAULT_LEVERAGE = 10;

const ALL_ASSETS = Array.from(
  BASKETS.flatMap((basket) => basket.assets.map((asset) => [asset.symbol, asset.asaId])).reduce(
    (map, [symbol, asaId]) => map.set(symbol, asaId),
    new Map<string, number>(),
  ),
);

const SYMBOL_TO_ASA = ALL_ASSETS.reduce((acc, [symbol, asaId]) => {
  acc[symbol] = asaId;
  return acc;
}, {} as Record<string, number>);

const ASA_TO_SYMBOL = Object.entries(SYMBOL_TO_ASA).reduce((acc, [symbol, asaId]) => {
  acc[asaId] = symbol;
  return acc;
}, {} as Record<number, string>);

function sanitizeNumberInput(raw: string): string {
  const normalized = raw.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const firstDot = normalized.indexOf(".");
  if (firstDot === -1) return normalized;

  const compact = `${normalized.slice(0, firstDot + 1)}${normalized
    .slice(firstDot + 1)
    .replace(/\./g, "")}`;
  const [intPart, decimalPart] = compact.split(".");

  if (decimalPart === undefined) return intPart;
  return `${intPart}.${decimalPart.slice(0, 6)}`;
}

function formatAlgo(amount: number): string {
  if (!Number.isFinite(amount)) return "0.0000";
  return amount
    .toFixed(4)
    .replace(/\.0+$/, "")
    .replace(/(\.[0-9]*?)0+$/, "$1");
}

function formatUsd(amount: number): string {
  if (!Number.isFinite(amount)) return "$0.00";
  return `$${amount.toFixed(2)}`;
}

function shortAddress(address: string): string {
  if (!address || address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function riskFromLeverage(leverage: number): "Low" | "Medium" | "High" {
  if (leverage <= 8) return "Low";
  if (leverage <= 16) return "Medium";
  return "High";
}

function equalWeights(symbols: string[]): Record<string, number> {
  if (symbols.length === 0) return {};
  const base = Math.floor(100 / symbols.length);
  const remainder = 100 - base * symbols.length;

  return symbols.reduce((acc, symbol, index) => {
    acc[symbol] = base + (index === 0 ? remainder : 0);
    return acc;
  }, {} as Record<string, number>);
}

function txTypeLabel(type: TxType): string {
  if (type === "bucket_create") return "BUCKET CREATE";
  return type.toUpperCase();
}

export default function BucketsScreen() {
  const router = useRouter();

  const depositSheetRef = useRef<BottomSheetModal | null>(null);
  const withdrawSheetRef = useRef<BottomSheetModal | null>(null);
  const newBucketSheetRef = useRef<BottomSheetModal | null>(null);
  const detailSheetRef = useRef<BottomSheetModal | null>(null);

  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<StoredPosition[]>([]);
  const [pnls, setPnls] = useState<Record<number, number>>({});
  const [txHistory, setTxHistory] = useState<Record<number, TxRow[]>>({});

  const [walletAddress, setWalletAddress] = useState("");
  const [walletAlgo, setWalletAlgo] = useState(0);
  const [collateralAlgo, setCollateralAlgo] = useState(0);

  const [selectedPosition, setSelectedPosition] = useState<StoredPosition | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const [depositAsset, setDepositAsset] = useState<(typeof DEPOSIT_ASSET_OPTIONS)[number]>("ALGO");
  const [depositAmount, setDepositAmount] = useState("");

  const [withdrawPercent, setWithdrawPercent] = useState<(typeof WITHDRAW_OPTIONS)[number]>(25);

  const [selectedBucketAssets, setSelectedBucketAssets] = useState<string[]>(["ALGO", "USDC"]);
  const [bucketWeights, setBucketWeights] = useState<Record<string, number>>({ ALGO: 50, USDC: 50 });
  const [createdBucketId, setCreatedBucketId] = useState<number | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedPositionPnl = selectedPosition ? (pnls[selectedPosition.positionId] ?? 0) : 0;

  const positionModels = useMemo<PositionModel[]>(() => {
    return positions.map((position) => {
      const pnlAlgo = pnls[position.positionId] ?? 0;
      const depositedAlgo = position.marginAlgo;
      const currentAlgo = Math.max(0, depositedAlgo + pnlAlgo);
      const symbols = position.asaIds
        .map((id) => ASA_TO_SYMBOL[id] ?? `ASA-${id}`)
        .slice(0, 4);

      return {
        position,
        symbols,
        depositedAlgo,
        currentAlgo,
        pnlAlgo,
      };
    });
  }, [pnls, positions]);

  const summary = useMemo(() => {
    const depositedTotal = positionModels.reduce((acc, item) => acc + item.depositedAlgo, 0);
    const currentTotal = positionModels.reduce((acc, item) => acc + item.currentAlgo, 0);
    const pnlTotal = currentTotal - depositedTotal;
    const pct = depositedTotal > 0 ? (pnlTotal / depositedTotal) * 100 : 0;

    return {
      depositedTotal,
      currentTotal,
      pct,
    };
  }, [positionModels]);

  const withdrawAmount = useMemo(() => {
    return collateralAlgo * (withdrawPercent / 100);
  }, [collateralAlgo, withdrawPercent]);

  const bucketWeightTotal = useMemo(() => {
    return selectedBucketAssets.reduce((acc, symbol) => acc + (bucketWeights[symbol] ?? 0), 0);
  }, [bucketWeights, selectedBucketAssets]);

  const selectedPositionTxRows = useMemo(() => {
    if (!selectedPosition) return [];
    return txHistory[selectedPosition.positionId] ?? [];
  }, [selectedPosition, txHistory]);

  const ingestPositionTxRows = useCallback((stored: StoredPosition[]) => {
    setTxHistory((prev) => {
      const next: Record<number, TxRow[]> = { ...prev };

      stored.forEach((position) => {
        const existing = next[position.positionId];
        if (!existing || existing.length === 0) {
          next[position.positionId] = [
            {
              txId: position.txId,
              type: "open",
              timestamp: position.openedAt,
              amountAlgo: position.marginAlgo,
            },
          ];
        }
      });

      Object.keys(next).forEach((id) => {
        if (!stored.some((position) => position.positionId === Number(id))) {
          delete next[Number(id)];
        }
      });

      return next;
    });
  }, []);

  const addTxRow = useCallback((positionId: number, row: TxRow) => {
    setTxHistory((prev) => {
      const current = prev[positionId] ?? [];
      return {
        ...prev,
        [positionId]: [row, ...current],
      };
    });
  }, []);

  const refreshData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      await algorandService.initializeWallet();
      const address = algorandService.getAddress();
      setWalletAddress(address);

      const [storedPositions, balance, collateral] = await Promise.all([
        positionStore.getAll(),
        algorandService.getBalance(address),
        crescaBucketService.getCollateralBalance(address),
      ]);

      setPositions(storedPositions);
      ingestPositionTxRows(storedPositions);

      setWalletAlgo(Number(balance.algo) || 0);
      setCollateralAlgo(Number(collateral) || 0);

      if (storedPositions.length === 0) {
        setPnls({});
        return;
      }

      const pnlMap: Record<number, number> = {};
      await Promise.all(
        storedPositions.map(async (position) => {
          try {
            const rawPnl = await crescaBucketService.getUnrealizedPnL(address, position.positionId);
            const parsed = Number(rawPnl);
            pnlMap[position.positionId] = Number.isFinite(parsed) ? parsed : 0;
          } catch {
            pnlMap[position.positionId] = 0;
          }
        }),
      );

      setPnls(pnlMap);
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Failed to load bucket data");
    } finally {
      setLoading(false);
    }
  }, [ingestPositionTxRows]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useFocusEffect(
    useCallback(() => {
      void refreshData();
    }, [refreshData]),
  );

  const handleDeposit = async () => {
    const amount = Number(depositAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage("Enter a valid deposit amount");
      return;
    }

    if (depositAsset !== "ALGO") {
      setErrorMessage("Testnet collateral deposit currently supports ALGO only");
      return;
    }

    setPendingAction("deposit");
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const txId = await crescaBucketService.depositCollateral(amount);
      if (selectedPosition) {
        addTxRow(selectedPosition.positionId, {
          txId,
          type: "deposit",
          timestamp: Date.now(),
          amountAlgo: amount,
        });
      }

      setSuccessMessage("Collateral deposited successfully");
      setDepositAmount("");
      depositSheetRef.current?.dismiss();
      await refreshData();
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Deposit failed");
    } finally {
      setPendingAction(null);
    }
  };

  const handleWithdraw = async () => {
    if (withdrawAmount <= 0) {
      setErrorMessage("No collateral available to withdraw");
      return;
    }

    setPendingAction("withdraw");
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const txId = await crescaBucketService.withdrawCollateral(withdrawAmount);
      if (selectedPosition) {
        addTxRow(selectedPosition.positionId, {
          txId,
          type: "withdraw",
          timestamp: Date.now(),
          amountAlgo: withdrawAmount,
        });
      }

      setSuccessMessage("Collateral withdrawn successfully");
      withdrawSheetRef.current?.dismiss();
      await refreshData();
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Withdraw failed");
    } finally {
      setPendingAction(null);
    }
  };

  const handleCreateBucket = async () => {
    if (selectedBucketAssets.length === 0) {
      setErrorMessage("Select at least one asset");
      return;
    }

    if (bucketWeightTotal !== 100) {
      setErrorMessage("Allocation total must equal 100%");
      return;
    }

    const assetIds = selectedBucketAssets.map((symbol) => SYMBOL_TO_ASA[symbol]);
    const weights = selectedBucketAssets.map((symbol) => bucketWeights[symbol] ?? 0);

    setPendingAction("create");
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { txId, bucketId } = await crescaBucketService.createBucket(
        assetIds,
        weights,
        DEFAULT_LEVERAGE,
      );

      setCreatedBucketId(bucketId);
      setSuccessMessage(`Bucket #${bucketId} created`);

      if (positions[0]) {
        addTxRow(positions[0].positionId, {
          txId,
          type: "bucket_create",
          timestamp: Date.now(),
        });
      }
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Bucket creation failed");
    } finally {
      setPendingAction(null);
    }
  };

  const handleClosePosition = async () => {
    if (!selectedPosition) return;

    setPendingAction("close");
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const oracleMap = await dartRouterService.getOraclePrices(selectedPosition.asaIds);
      const oracleIds = Array.from(oracleMap.keys());
      const oraclePrices = oracleIds.map((id) => oracleMap.get(id) ?? 0);

      if (oracleIds.length > 0) {
        await crescaBucketService.updateOracle(oracleIds, oraclePrices);
      }

      const { txId, pnlAlgo } = await crescaBucketService.closePosition(
        selectedPosition.positionId,
        selectedPosition.bucketId,
        selectedPosition.asaIds,
      );

      addTxRow(selectedPosition.positionId, {
        txId,
        type: "close",
        timestamp: Date.now(),
        amountAlgo: Number(pnlAlgo),
      });

      await positionStore.remove(selectedPosition.positionId);
      detailSheetRef.current?.dismiss();
      setSelectedPosition(null);
      setSuccessMessage(`Position closed. Realized P&L: ${Number(pnlAlgo).toFixed(4)} ALGO`);
      await refreshData();
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Close position failed");
    } finally {
      setPendingAction(null);
    }
  };

  const toggleBucketAsset = (symbol: string) => {
    setCreatedBucketId(null);
    setErrorMessage(null);

    setSelectedBucketAssets((prev) => {
      const exists = prev.includes(symbol);
      const next = exists ? prev.filter((item) => item !== symbol) : [...prev, symbol];

      setBucketWeights((current) => {
        if (next.length === 0) return {};

        const balanced = equalWeights(next);
        const merged = { ...current };

        next.forEach((item) => {
          if (merged[item] == null) {
            merged[item] = balanced[item];
          }
        });

        Object.keys(merged).forEach((key) => {
          if (!next.includes(key)) delete merged[key];
        });

        return merged;
      });

      return next;
    });
  };

  const renderCard = ({ item }: { item: PositionModel }) => {
    const isGain = item.pnlAlgo >= 0;
    const risk = riskFromLeverage(item.position.leverage);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.95}
        onPress={() => {
          setSelectedPosition(item.position);
          detailSheetRef.current?.present();
        }}
      >
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Bucket #{item.position.bucketId}</Text>
          <StatusTag
            label={`${isGain ? "Gain" : "Loss"} ${isGain ? "+" : ""}${item.pnlAlgo.toFixed(2)} ALGO`}
            variant={isGain ? "success" : "danger"}
          />
        </View>

        <View style={styles.cardChipsRow}>
          {item.symbols.map((symbol) => (
            <AssetChip key={`${item.position.positionId}-${symbol}`} symbol={symbol} />
          ))}
        </View>

        <View style={styles.cardMetricRow}>
          <Text style={styles.metricLabel}>Deposited</Text>
          <Text style={styles.metricValue}>{formatAlgo(item.depositedAlgo)} ALGO</Text>
        </View>

        <View style={styles.cardMetricRow}>
          <Text style={styles.metricLabel}>Current</Text>
          <Text style={styles.metricValue}>{formatAlgo(item.currentAlgo)} ALGO</Text>
        </View>

        <View style={styles.cardMetricRow}>
          <Text style={styles.metricLabel}>P&L</Text>
          <Text style={[styles.metricValue, isGain ? styles.gainText : styles.lossText]}>
            {isGain ? "+" : ""}
            {formatAlgo(item.pnlAlgo)} ALGO
          </Text>
        </View>

        <View style={styles.contractRow}>
          <Text style={styles.contractLabel}>Contract App ID</Text>
          <Text style={styles.contractValue}>{CONTRACT_APP_IDS.CrescaBucketProtocol}</Text>
        </View>

        <View style={styles.tagRow}>
          <StatusTag label={`Risk: ${risk}`} variant={risk === "High" ? "warning" : risk === "Medium" ? "info" : "success"} />
          <StatusTag label={`${item.position.leverage}x`} variant="purple" />
        </View>

        <View style={styles.cardActionsRow}>
          <View style={styles.cardActionCol}>
            <PrimaryButton
              label="Withdraw"
              variant="outline"
              style={styles.cardActionButton}
              onPress={() => {
                setSelectedPosition(item.position);
                setWithdrawPercent(25);
                withdrawSheetRef.current?.present();
              }}
            />
          </View>

          <View style={styles.cardActionCol}>
            <PrimaryButton
              label="Deposit More"
              variant="black"
              style={styles.cardActionButton}
              onPress={() => {
                setSelectedPosition(item.position);
                setDepositAsset("ALGO");
                setDepositAmount("");
                depositSheetRef.current?.present();
              }}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderCuratedBasketCard = (item: (typeof BASKETS)[number]) => {
    const leverage = DEFAULT_LEVERAGE;
    const risk = riskFromLeverage(leverage);
    const totalValue = item.assets.reduce((acc, asset) => acc + asset.weight, 0);

    return (
      <View
        style={{
          width: "100%",
          marginRight: 0,
          borderWidth: 1,
          borderColor: C.borders.bDefault,
          borderRadius: R.lg,
          backgroundColor: C.surfaces.bgBase,
          padding: S.md,
          gap: 10,
        }}
      >
        <Text style={{ ...T.h3, color: C.text.t1 }}>{item.name}</Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {item.assets.slice(0, 4).map((asset) => (
            <AssetChip key={`${item.id}-${asset.symbol}`} symbol={asset.symbol} />
          ))}
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <StatusTag
            label={`Risk: ${risk}`}
            variant={risk === "High" ? "warning" : risk === "Medium" ? "info" : "success"}
          />
          <StatusTag label={`${leverage}x`} variant="purple" />
        </View>

        <PrimaryButton
          label="Trade"
          variant="black"
          onPress={() =>
            router.push({
              pathname: "/bundleTrade",
              params: {
                bundleId: item.id,
                bundleName: item.name,
                assets: JSON.stringify(item.assets),
                totalValue: String(totalValue),
              },
            })
          }
        />
      </View>
    );
  };

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerIconButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={20} color={C.text.t1} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>My Buckets</Text>

        <TouchableOpacity
          style={styles.newBucketButton}
          accessibilityRole="button"
          accessibilityLabel="Create new bucket"
          onPress={() => {
            setCreatedBucketId(null);
            newBucketSheetRef.current?.present();
          }}
        >
          <Ionicons name="add" size={14} color={C.text.t1} />
          <Text style={styles.newBucketButtonText}>New</Text>
        </TouchableOpacity>
      </View>

      {errorMessage ? (
        <View style={styles.messageError}>
          <Text style={styles.messageErrorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {successMessage ? (
        <View style={styles.messageSuccess}>
          <Text style={styles.messageSuccessText}>{successMessage}</Text>
        </View>
      ) : null}

      <FlatList
        data={positionModels}
        keyExtractor={(item) => String(item.position.positionId)}
        renderItem={renderCard}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <View style={styles.summaryBar}>
              <View>
                <Text style={styles.summaryLabel}>Total positions</Text>
                <Text style={styles.summaryValue}>{formatUsd(summary.currentTotal)}</Text>
              </View>

              <View style={styles.summaryRight}>
                <Text style={[styles.summaryPct, summary.pct >= 0 ? styles.gainText : styles.lossText]}>
                  {summary.pct >= 0 ? "▲" : "▼"} {Math.abs(summary.pct).toFixed(2)}%
                </Text>
                <Text style={styles.summarySub}>Collateral {formatAlgo(collateralAlgo)} ALGO</Text>
              </View>
            </View>

            <Text
              style={{
                ...T.smBold,
                color: C.text.t2,
                marginHorizontal: H_PAD,
                marginBottom: 8,
              }}
            >
              Curated Baskets
            </Text>

            <View
              style={{
                paddingHorizontal: H_PAD,
                paddingBottom: S.sm,
                gap: 12,
              }}
            >
              {BASKETS.map((item) => (
                <React.Fragment key={item.id}>{renderCuratedBasketCard(item)}</React.Fragment>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="cube-outline" size={32} color={C.text.t2} />
              <Text style={styles.emptyTitle}>No active positions</Text>
              <Text style={styles.emptySubtitle}>Create your first bucket</Text>
              <PrimaryButton
                label="Create Bucket"
                variant="black"
                style={styles.emptyCta}
                onPress={() => newBucketSheetRef.current?.present()}
              />
            </View>
          ) : null
        }
        ListFooterComponent={
          loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={C.brand.teal} />
              <Text style={styles.loadingText}>Loading buckets...</Text>
            </View>
          ) : null
        }
      />

      <CrescaSheet sheetRef={depositSheetRef} snapPoints={["70%"]} title="Deposit to Bucket">
        <View style={styles.sheetWrap}>
          <View style={styles.assetSelectorRow}>
            {DEPOSIT_ASSET_OPTIONS.map((asset) => {
              const active = depositAsset === asset;
              return (
                <TouchableOpacity
                  key={asset}
                  style={[styles.assetPill, active ? styles.assetPillActive : styles.assetPillInactive]}
                  onPress={() => setDepositAsset(asset)}
                >
                  <Text style={[styles.assetPillText, active ? styles.assetPillTextActive : styles.assetPillTextInactive]}>
                    {asset}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <CrescaInput
            label="Amount"
            placeholder="0.00"
            keyboardType="decimal-pad"
            value={depositAmount}
            onChangeText={(value) => setDepositAmount(sanitizeNumberInput(value))}
          />

          <View style={styles.maxRow}>
            <Text style={styles.maxLabel}>Max: {formatAlgo(walletAlgo)} ALGO</Text>
            <TouchableOpacity
              style={styles.maxButton}
              onPress={() => setDepositAmount(walletAlgo > 0 ? walletAlgo.toFixed(4) : "")}
            >
              <Text style={styles.maxButtonText}>Max</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.previewText}>
            You will receive {formatAlgo(Number(depositAmount) || 0)} gALGO
          </Text>

          <PrimaryButton
            label="Deposit"
            variant="teal"
            loading={pendingAction === "deposit"}
            onPress={handleDeposit}
          />
        </View>
      </CrescaSheet>

      <CrescaSheet sheetRef={withdrawSheetRef} snapPoints={["65%"]} title="Withdraw">
        <View style={styles.sheetWrap}>
          <View style={styles.withdrawQuickRow}>
            {WITHDRAW_OPTIONS.map((pct) => {
              const active = withdrawPercent === pct;
              return (
                <TouchableOpacity
                  key={pct}
                  style={[styles.withdrawPill, active ? styles.withdrawPillActive : styles.withdrawPillInactive]}
                  onPress={() => setWithdrawPercent(pct)}
                >
                  <Text
                    style={[
                      styles.withdrawPillText,
                      active ? styles.withdrawPillTextActive : styles.withdrawPillTextInactive,
                    ]}
                  >
                    {pct === 100 ? "Max" : `${pct}%`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.readonlyAmountBox}>
            <Text style={styles.readonlyAmountLabel}>Amount</Text>
            <Text style={styles.readonlyAmountValue}>{formatAlgo(withdrawAmount)} ALGO</Text>
          </View>

          <Text style={styles.previewText}>Est. received: {formatUsd(withdrawAmount)} USDC</Text>

          <TouchableOpacity
            style={styles.dangerOutlineButton}
            onPress={handleWithdraw}
            disabled={pendingAction === "withdraw"}
          >
            {pendingAction === "withdraw" ? (
              <ActivityIndicator size="small" color={C.semantic.danger} />
            ) : (
              <Text style={styles.dangerOutlineText}>Withdraw</Text>
            )}
          </TouchableOpacity>
        </View>
      </CrescaSheet>

      <CrescaSheet sheetRef={newBucketSheetRef} snapPoints={["85%"]} title="Create Bucket">
        <View style={styles.sheetWrap}>
          <Text style={styles.sectionLabel}>Step 1: Select assets</Text>
          <View style={styles.multiAssetWrap}>
            {ALL_ASSETS.map(([symbol]) => {
              const selected = selectedBucketAssets.includes(symbol);
              return (
                <TouchableOpacity
                  key={symbol}
                  style={styles.multiAssetRow}
                  onPress={() => toggleBucketAsset(symbol)}
                >
                  <Ionicons
                    name={selected ? "checkbox" : "square-outline"}
                    size={18}
                    color={selected ? C.brand.teal : C.text.t2}
                  />
                  <AssetChip symbol={symbol} />
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>Step 2: Allocation</Text>
          <View style={styles.progressWrap}>
            <View style={styles.progressBarBase}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.min(100, Math.max(0, bucketWeightTotal))}%`,
                    backgroundColor: bucketWeightTotal === 100 ? C.brand.teal : C.semantic.warning,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>Total {bucketWeightTotal}%</Text>
          </View>

          {selectedBucketAssets.map((symbol) => (
            <View key={`slider-${symbol}`} style={styles.sliderRow}>
              <View style={styles.sliderHead}>
                <Text style={styles.sliderSymbol}>{symbol}</Text>
                <Text style={styles.sliderPct}>{bucketWeights[symbol] ?? 0}%</Text>
              </View>
              <Slider
                minimumValue={0}
                maximumValue={100}
                step={1}
                value={bucketWeights[symbol] ?? 0}
                minimumTrackTintColor={C.brand.teal}
                maximumTrackTintColor={C.borders.bDefault}
                thumbTintColor={C.brand.teal}
                onValueChange={(nextValue) => {
                  setBucketWeights((prev) => ({
                    ...prev,
                    [symbol]: Math.round(nextValue),
                  }));
                }}
              />
            </View>
          ))}

          <PrimaryButton
            label="Create Bucket"
            variant="black"
            loading={pendingAction === "create"}
            onPress={handleCreateBucket}
            disabled={bucketWeightTotal !== 100 || selectedBucketAssets.length === 0}
          />

          {createdBucketId !== null ? (
            <Text style={styles.contractPreviewText}>
              Contract App ID: {CONTRACT_APP_IDS.CrescaBucketProtocol} | Bucket ID: {createdBucketId}
            </Text>
          ) : null}
        </View>
      </CrescaSheet>

      <CrescaSheet sheetRef={detailSheetRef} snapPoints={["85%"]} title="Bucket Detail">
        {selectedPosition ? (
          <View style={styles.sheetWrap}>
            <View style={styles.detailHeaderRow}>
              <Text style={styles.detailTitle}>Position #{selectedPosition.positionId}</Text>
              <StatusTag
                label={selectedPositionPnl >= 0 ? "Positive" : "Negative"}
                variant={selectedPositionPnl >= 0 ? "success" : "danger"}
              />
            </View>

            <View style={styles.detailMetricRow}>
              <Text style={styles.metricLabel}>Bucket</Text>
              <Text style={styles.metricValue}>#{selectedPosition.bucketId}</Text>
            </View>

            <View style={styles.detailMetricRow}>
              <Text style={styles.metricLabel}>Leverage</Text>
              <Text style={styles.metricValue}>{selectedPosition.leverage}x</Text>
            </View>

            <View style={styles.detailMetricRow}>
              <Text style={styles.metricLabel}>Margin</Text>
              <Text style={styles.metricValue}>{formatAlgo(selectedPosition.marginAlgo)} ALGO</Text>
            </View>

            <View style={styles.detailMetricRow}>
              <Text style={styles.metricLabel}>Unrealized P&L</Text>
              <Text style={[styles.metricValue, selectedPositionPnl >= 0 ? styles.gainText : styles.lossText]}>
                {selectedPositionPnl >= 0 ? "+" : ""}
                {formatAlgo(selectedPositionPnl)} ALGO
              </Text>
            </View>

            <Text style={styles.sectionLabel}>Tx History</Text>
            {selectedPositionTxRows.length === 0 ? (
              <Text style={styles.mutedText}>No transactions yet.</Text>
            ) : (
              selectedPositionTxRows.map((row) => (
                <TouchableOpacity
                  key={`${row.type}-${row.txId}-${row.timestamp}`}
                  style={styles.txRow}
                  onPress={() =>
                    Linking.openURL(`https://lora.algokit.io/testnet/transaction/${row.txId}`)
                  }
                >
                  <View>
                    <Text style={styles.txType}>{txTypeLabel(row.type)}</Text>
                    <Text style={styles.txTime}>{new Date(row.timestamp).toLocaleString()}</Text>
                  </View>
                  <Text style={styles.txLink}>View</Text>
                </TouchableOpacity>
              ))
            )}

            <Text style={styles.sectionLabel}>Contract Metadata</Text>
            <View style={styles.metaBox}>
              <Text style={styles.metaLine}>App ID: {CONTRACT_APP_IDS.CrescaBucketProtocol}</Text>
              <Text style={styles.metaLine}>Owner: {shortAddress(walletAddress)}</Text>
              <Text style={styles.metaLine}>Collateral: {formatAlgo(collateralAlgo)} ALGO</Text>
            </View>

            <TouchableOpacity
              style={styles.dangerOutlineButton}
              onPress={handleClosePosition}
              disabled={pendingAction === "close"}
            >
              {pendingAction === "close" ? (
                <ActivityIndicator size="small" color={C.semantic.danger} />
              ) : (
                <Text style={styles.dangerOutlineText}>Close Position</Text>
              )}
            </TouchableOpacity>
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
  header: {
    height: 56,
    paddingHorizontal: H_PAD,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: C.borders.bDefault,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...T.h2,
    color: C.text.t1,
  },
  newBucketButton: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.surfaces.bgBase,
  },
  newBucketButtonText: {
    ...T.smBold,
    color: C.text.t1,
  },
  messageError: {
    marginTop: S.sm,
    marginHorizontal: H_PAD,
    backgroundColor: "rgba(240,68,56,0.08)",
    borderWidth: 1,
    borderColor: C.semantic.danger,
    borderRadius: R.md,
    padding: 10,
  },
  messageErrorText: {
    ...T.sm,
    color: C.semantic.danger,
  },
  messageSuccess: {
    marginTop: S.sm,
    marginHorizontal: H_PAD,
    backgroundColor: "rgba(18,183,106,0.08)",
    borderWidth: 1,
    borderColor: C.semantic.success,
    borderRadius: R.md,
    padding: 10,
  },
  messageSuccessText: {
    ...T.sm,
    color: C.semantic.success,
  },
  listContent: {
    paddingBottom: S.xl,
    flexGrow: 1,
  },
  summaryBar: {
    marginTop: S.md,
    marginBottom: S.sm,
    marginHorizontal: H_PAD,
    borderRadius: 12,
    backgroundColor: C.surfaces.bgSurface,
    padding: S.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    ...T.sm,
    color: C.text.t2,
  },
  summaryValue: {
    ...T.h2,
    color: C.text.t1,
    marginTop: 2,
  },
  summaryRight: {
    alignItems: "flex-end",
  },
  summaryPct: {
    ...T.smBold,
  },
  summarySub: {
    ...T.sm,
    color: C.text.t2,
    marginTop: 2,
  },
  card: {
    marginHorizontal: H_PAD,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    borderRadius: R.lg,
    backgroundColor: C.surfaces.bgBase,
    padding: S.md,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    ...T.h3,
    color: C.text.t1,
  },
  cardChipsRow: {
    marginTop: S.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cardMetricRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metricLabel: {
    ...T.sm,
    color: C.text.t2,
  },
  metricValue: {
    ...T.bodyMd,
    color: C.text.t1,
  },
  gainText: {
    color: C.semantic.success,
  },
  lossText: {
    color: C.semantic.danger,
  },
  contractRow: {
    marginTop: S.sm,
    paddingTop: S.sm,
    borderTopWidth: 1,
    borderTopColor: C.borders.bDefault,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  contractLabel: {
    ...T.sm,
    color: C.text.t2,
  },
  contractValue: {
    ...T.address,
    color: C.text.t1,
  },
  tagRow: {
    marginTop: S.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cardActionsRow: {
    marginTop: S.md,
    flexDirection: "row",
    gap: 10,
  },
  cardActionCol: {
    flex: 1,
  },
  cardActionButton: {
    width: "100%",
  },
  emptyWrap: {
    marginTop: 80,
    alignItems: "center",
    paddingHorizontal: H_PAD,
  },
  emptyTitle: {
    ...T.h2,
    color: C.text.t1,
    marginTop: S.sm,
  },
  emptySubtitle: {
    ...T.body,
    color: C.text.t2,
    marginTop: 2,
  },
  emptyCta: {
    marginTop: S.md,
    minWidth: 180,
  },
  loadingWrap: {
    marginTop: S.lg,
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    ...T.sm,
    color: C.text.t2,
  },
  sheetWrap: {
    gap: 12,
    paddingTop: 6,
    paddingBottom: 16,
  },
  assetSelectorRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  assetPill: {
    borderRadius: R.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  assetPillActive: {
    backgroundColor: C.brand.black,
    borderColor: C.brand.black,
  },
  assetPillInactive: {
    backgroundColor: C.surfaces.bgSurface,
    borderColor: C.borders.bDefault,
  },
  assetPillText: {
    ...T.smBold,
  },
  assetPillTextActive: {
    color: C.text.tInv,
  },
  assetPillTextInactive: {
    color: C.text.t2,
  },
  maxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  maxLabel: {
    ...T.sm,
    color: C.text.t2,
  },
  maxButton: {
    borderWidth: 1,
    borderColor: C.brand.teal,
    borderRadius: R.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  maxButtonText: {
    ...T.smBold,
    color: C.brand.teal,
  },
  previewText: {
    ...T.sm,
    color: C.text.t2,
  },
  withdrawQuickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  withdrawPill: {
    borderRadius: R.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  withdrawPillActive: {
    backgroundColor: C.brand.black,
    borderColor: C.brand.black,
  },
  withdrawPillInactive: {
    backgroundColor: C.surfaces.bgSurface,
    borderColor: C.borders.bDefault,
  },
  withdrawPillText: {
    ...T.smBold,
  },
  withdrawPillTextActive: {
    color: C.text.tInv,
  },
  withdrawPillTextInactive: {
    color: C.text.t2,
  },
  readonlyAmountBox: {
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    borderRadius: R.md,
    backgroundColor: C.surfaces.bgSurface,
    padding: 12,
  },
  readonlyAmountLabel: {
    ...T.sm,
    color: C.text.t2,
  },
  readonlyAmountValue: {
    ...T.h3,
    color: C.text.t1,
    marginTop: 2,
  },
  dangerOutlineButton: {
    borderWidth: 1,
    borderColor: C.semantic.danger,
    borderRadius: R.full,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(240,68,56,0.04)",
  },
  dangerOutlineText: {
    ...T.btn,
    color: C.semantic.danger,
  },
  sectionLabel: {
    ...T.smBold,
    color: C.text.t1,
    marginTop: 4,
  },
  multiAssetWrap: {
    gap: 8,
  },
  multiAssetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  progressWrap: {
    gap: 6,
  },
  progressBarBase: {
    height: 8,
    borderRadius: R.full,
    backgroundColor: C.surfaces.bgSunken,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 8,
    borderRadius: R.full,
  },
  progressText: {
    ...T.sm,
    color: C.text.t2,
  },
  sliderRow: {
    gap: 4,
  },
  sliderHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sliderSymbol: {
    ...T.bodyMd,
    color: C.text.t1,
  },
  sliderPct: {
    ...T.smBold,
    color: C.brand.tealDim,
  },
  contractPreviewText: {
    ...T.address,
    color: C.text.t1,
    marginTop: 4,
  },
  detailHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  detailTitle: {
    ...T.h2,
    color: C.text.t1,
    flex: 1,
  },
  detailMetricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mutedText: {
    ...T.sm,
    color: C.text.t2,
  },
  txRow: {
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    borderRadius: R.md,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.surfaces.bgSurface,
  },
  txType: {
    ...T.smBold,
    color: C.text.t1,
  },
  txTime: {
    ...T.sm,
    color: C.text.t2,
    marginTop: 2,
  },
  txLink: {
    ...T.smBold,
    color: C.brand.purple,
  },
  metaBox: {
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    borderRadius: R.md,
    padding: 12,
    backgroundColor: C.surfaces.bgSurface,
    gap: 6,
  },
  metaLine: {
    ...T.address,
    color: C.text.t1,
  },
});
