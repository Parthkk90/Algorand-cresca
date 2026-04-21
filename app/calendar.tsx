import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import algosdk from "algosdk";
import * as Haptics from "expo-haptics";
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
import {
  CONTRACT_APP_IDS,
  crescaCalendarService,
} from "../services/algorandContractServices";
import { algorandService } from "../services/algorandService";
import { notificationService } from "../services/notificationService";
import { CrescaInput, CrescaSheet, PrimaryButton, StatusTag } from "../src/components/ui";
import { C, H_PAD, R, S, T } from "../src/theme";

type LocalSchedule = {
  id: number;
  recipient: string;
  amount: number;
  executeAt: number;
  intervalSeconds: number;
  occurrences: number;
  executedCount: number;
  active: boolean;
  txId?: string;
  notificationId?: string;
};

type FrequencyOption = "once" | "daily" | "weekly" | "monthly" | "custom";
type PaymentStatus = "pending" | "confirmed" | "failed" | "scheduled";
type PaymentAsset = "ALGO" | "USDC" | "ASA";

type CalendarCell = {
  date: Date;
  day: number;
  isCurrentMonth: boolean;
};

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PAYMENT_ASSETS: PaymentAsset[] = ["ALGO", "USDC", "ASA"];
const FREQUENCY_OPTIONS: Array<{ key: FrequencyOption; label: string }> = [
  { key: "once", label: "Once" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "custom", label: "Custom" },
];

const schedulesKey = (address: string) => `calendar_schedules_${address}`;

function formatAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatAmount(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(timestampSec: number): string {
  return new Date(timestampSec * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function startOfDay(date: Date): Date {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function firstDayOfMonth(date: Date): Date {
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toUnixAtNoon(date: Date): number {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function sanitizeNumeric(raw: string): string {
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

function frequencyLabel(schedule: LocalSchedule): string {
  if (schedule.occurrences === 1) return "Once";
  if (schedule.intervalSeconds === 24 * 60 * 60) return "Daily";
  if (schedule.intervalSeconds === 7 * 24 * 60 * 60) return "Weekly";
  if (schedule.intervalSeconds === 30 * 24 * 60 * 60) return "Monthly";
  return `Every ${Math.max(1, Math.floor(schedule.intervalSeconds / 86400))} days`;
}

function statusFromSchedule(
  schedule: LocalSchedule,
  failedIds: Set<number>,
): PaymentStatus {
  if (failedIds.has(schedule.id)) return "failed";
  if (!schedule.active && schedule.executedCount > 0) return "confirmed";
  if (!schedule.active) return "failed";

  const nowSec = Math.floor(Date.now() / 1000);
  const secondsLeft = schedule.executeAt - nowSec;

  if (secondsLeft <= 24 * 60 * 60) return "pending";
  return "scheduled";
}

function tagVariantForStatus(status: PaymentStatus): "warning" | "success" | "danger" | "purple" {
  if (status === "pending") return "warning";
  if (status === "confirmed") return "success";
  if (status === "failed") return "danger";
  return "purple";
}

function statusLabel(status: PaymentStatus): string {
  if (status === "pending") return "Pending";
  if (status === "confirmed") return "Confirmed";
  if (status === "failed") return "Failed";
  return "Scheduled";
}

function buildCalendarCells(baseMonth: Date): CalendarCell[] {
  const start = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
  const firstDow = (start.getDay() + 6) % 7;
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - firstDow);

  return Array.from({ length: 42 }).map((_, idx) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + idx);
    return {
      date,
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === baseMonth.getMonth(),
    };
  });
}

export default function CalendarScreen() {
  const router = useRouter();

  const newPaymentSheetRef = useRef<BottomSheetModal | null>(null);
  const paymentDetailSheetRef = useRef<BottomSheetModal | null>(null);
  const frequencySheetRef = useRef<BottomSheetModal | null>(null);
  const startDateSheetRef = useRef<BottomSheetModal | null>(null);

  const [walletAddress, setWalletAddress] = useState("");
  const [walletBalance, setWalletBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const [monthDate, setMonthDate] = useState(startOfDay(new Date()));
  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));

  const [schedules, setSchedules] = useState<LocalSchedule[]>([]);
  const [chainCount, setChainCount] = useState<number | null>(null);
  const [failedScheduleIds, setFailedScheduleIds] = useState<number[]>([]);

  const [selectedSchedule, setSelectedSchedule] = useState<LocalSchedule | null>(null);

  const [recipientInput, setRecipientInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<PaymentAsset>("ALGO");
  const [frequency, setFrequency] = useState<FrequencyOption>("weekly");
  const [frequencyDraft, setFrequencyDraft] = useState<FrequencyOption>("weekly");
  const [customDaysInput, setCustomDaysInput] = useState("7");
  const [startDate, setStartDate] = useState(startOfDay(new Date()));
  const [startDateDraft, setStartDateDraft] = useState(startOfDay(new Date()));
  const [startDateMonth, setStartDateMonth] = useState(firstDayOfMonth(new Date()));

  const [formError, setFormError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: "error" | "success"; message: string } | null>(null);

  const failedIdSet = useMemo(() => new Set(failedScheduleIds), [failedScheduleIds]);

  const calendarCells = useMemo(() => buildCalendarCells(monthDate), [monthDate]);
  const startDateCells = useMemo(() => buildCalendarCells(startDateMonth), [startDateMonth]);

  const activeSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.active),
    [schedules],
  );

  const upcomingSchedule = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return activeSchedules
      .filter((schedule) => schedule.executeAt >= now)
      .sort((a, b) => a.executeAt - b.executeAt)[0];
  }, [activeSchedules]);

  const daySchedules = useMemo(() => {
    return schedules
      .filter((schedule) =>
        isSameDay(new Date(schedule.executeAt * 1000), selectedDate),
      )
      .sort((a, b) => a.executeAt - b.executeAt);
  }, [schedules, selectedDate]);

  const dayTitle = useMemo(() => {
    const today = startOfDay(new Date());
    const prefix = isSameDay(today, selectedDate) ? "Today" : selectedDate.toLocaleDateString("en-US", { weekday: "long" });
    return `${prefix} · ${formatDateLabel(selectedDate)}`;
  }, [selectedDate]);

  const requestRefreshWallet = useCallback(async () => {
    const balance = await algorandService.getBalance();
    setWalletBalance(Number(balance.algo) || 0);
  }, []);

  const loadLocalSchedules = useCallback(async (address: string) => {
    const raw = await AsyncStorage.getItem(schedulesKey(address));
    const parsed = raw ? (JSON.parse(raw) as LocalSchedule[]) : [];
    setSchedules(parsed);
  }, []);

  const persistSchedules = useCallback(
    async (next: LocalSchedule[]) => {
      setSchedules(next);
      if (!walletAddress) return;
      await AsyncStorage.setItem(schedulesKey(walletAddress), JSON.stringify(next));
    },
    [walletAddress],
  );

  const refreshChainCount = useCallback(async (address: string) => {
    try {
      const count = await crescaCalendarService.getUserScheduleCount(address);
      setChainCount(count);
    } catch {
      setChainCount(null);
    }
  }, []);

  const initialize = useCallback(async () => {
    setIsLoading(true);
    setBanner(null);

    try {
      const wallet = await algorandService.initializeWallet();
      setWalletAddress(wallet.address);
      await Promise.all([
        requestRefreshWallet(),
        loadLocalSchedules(wallet.address),
        refreshChainCount(wallet.address),
        notificationService.requestPermissions(),
      ]);
    } catch (error: any) {
      setBanner({ tone: "error", message: error?.message ?? "Failed to initialize calendar" });
    } finally {
      setIsLoading(false);
    }
  }, [loadLocalSchedules, refreshChainCount, requestRefreshWallet]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const hasScheduledPayment = (date: Date) => {
    return activeSchedules.some((schedule) =>
      isSameDay(new Date(schedule.executeAt * 1000), date),
    );
  };

  const openNewPaymentSheet = () => {
    const initialStartDate = startOfDay(selectedDate);

    setBanner(null);
    setFormError(null);
    setRecipientInput("");
    setAmountInput("");
    setSelectedAsset("ALGO");
    setFrequency("weekly");
    setFrequencyDraft("weekly");
    setCustomDaysInput("7");
    setStartDate(initialStartDate);
    setStartDateDraft(initialStartDate);
    setStartDateMonth(firstDayOfMonth(initialStartDate));
    newPaymentSheetRef.current?.present();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openDetailSheet = (schedule: LocalSchedule) => {
    setSelectedSchedule(schedule);
    paymentDetailSheetRef.current?.present();
    void Haptics.selectionAsync();
  };

  const handleCreateSchedule = async () => {
    setFormError(null);
    setBanner(null);

    if (!recipientInput.trim() || !algosdk.isValidAddress(recipientInput.trim())) {
      setFormError("Enter a valid Algorand address");
      return;
    }

    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Enter a valid amount");
      return;
    }

    if (selectedAsset !== "ALGO") {
      setFormError("Current contract flow supports ALGO schedules only");
      return;
    }

    const startTs = toUnixAtNoon(startDate);
    if (startTs <= Math.floor(Date.now() / 1000)) {
      setFormError("Start date must be in the future");
      return;
    }

    let intervalSeconds = 7 * 24 * 60 * 60;
    let occurrences = 12;

    if (frequency === "once") {
      intervalSeconds = 0;
      occurrences = 1;
    } else if (frequency === "daily") {
      intervalSeconds = 24 * 60 * 60;
      occurrences = 30;
    } else if (frequency === "weekly") {
      intervalSeconds = 7 * 24 * 60 * 60;
      occurrences = 12;
    } else if (frequency === "monthly") {
      intervalSeconds = 30 * 24 * 60 * 60;
      occurrences = 12;
    } else {
      const customDays = Number(customDaysInput);
      if (!Number.isFinite(customDays) || customDays <= 0) {
        setFormError("Enter valid custom interval days");
        return;
      }
      intervalSeconds = Math.floor(customDays) * 24 * 60 * 60;
      occurrences = 12;
    }

    try {
      setIsSubmitting(true);

      const result =
        frequency === "once"
          ? await crescaCalendarService.createOneTimePayment(
              recipientInput.trim(),
              amount,
              startTs,
            )
          : await crescaCalendarService.createSchedule(
              recipientInput.trim(),
              amount,
              startTs,
              intervalSeconds,
              occurrences,
            );

      const notificationId = await notificationService.schedulePaymentNotification({
        scheduleId: result.scheduleId,
        recipient: recipientInput.trim(),
        amountAlgo: amount,
        executeAt: startTs,
      });

      const nextSchedule: LocalSchedule = {
        id: result.scheduleId,
        recipient: recipientInput.trim(),
        amount,
        executeAt: startTs,
        intervalSeconds,
        occurrences,
        executedCount: 0,
        active: true,
        txId: result.txId,
        notificationId,
      };

      const next = [nextSchedule, ...schedules];
      await persistSchedules(next);
      await refreshChainCount(walletAddress);
      await requestRefreshWallet();

      setBanner({ tone: "success", message: "Payment schedule created" });
      newPaymentSheetRef.current?.dismiss();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      setFormError(error?.message ?? "Failed to create schedule");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExecuteSchedule = async (schedule: LocalSchedule) => {
    try {
      setIsExecuting(true);
      setBanner(null);

      const txId = await crescaCalendarService.executeSchedule(
        walletAddress,
        schedule.id,
        schedule.recipient,
      );

      await notificationService.cancelNotification(schedule.notificationId);

      const next = await Promise.all(
        schedules.map(async (entry) => {
          if (entry.id !== schedule.id) return entry;

          const nextExecuted = Math.min(entry.executedCount + 1, entry.occurrences);
          const stillActive = nextExecuted < entry.occurrences;
          const nextExecuteAt =
            entry.intervalSeconds > 0
              ? entry.executeAt + entry.intervalSeconds
              : entry.executeAt;

          let nextNotificationId: string | undefined;
          if (stillActive) {
            nextNotificationId = await notificationService.rescheduleNextNotification({
              scheduleId: entry.id,
              recipient: entry.recipient,
              amountAlgo: entry.amount,
              executeAt: nextExecuteAt,
            });
          }

          return {
            ...entry,
            txId,
            executedCount: nextExecuted,
            active: stillActive,
            executeAt: stillActive ? nextExecuteAt : entry.executeAt,
            notificationId: nextNotificationId,
          };
        }),
      );

      await persistSchedules(next);
      await requestRefreshWallet();

      setFailedScheduleIds((prev) => prev.filter((id) => id !== schedule.id));
      setBanner({ tone: "success", message: `Payment executed · ${txId.slice(0, 8)}...` });
      paymentDetailSheetRef.current?.dismiss();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      setFailedScheduleIds((prev) => Array.from(new Set([...prev, schedule.id])));
      setBanner({ tone: "error", message: error?.message ?? "Failed to execute schedule" });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCancelSchedule = async (schedule: LocalSchedule) => {
    try {
      setIsCancelling(true);
      setBanner(null);

      await crescaCalendarService.cancelSchedule(schedule.id);
      await notificationService.cancelNotification(schedule.notificationId);

      const next = schedules.map((entry) =>
        entry.id === schedule.id
          ? { ...entry, active: false, notificationId: undefined }
          : entry,
      );

      await persistSchedules(next);
      paymentDetailSheetRef.current?.dismiss();
      setBanner({ tone: "success", message: "Payment schedule cancelled" });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      setFailedScheduleIds((prev) => Array.from(new Set([...prev, schedule.id])));
      setBanner({ tone: "error", message: error?.message ?? "Failed to cancel schedule" });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsCancelling(false);
    }
  };

  const renderCalendarDay = (cell: CalendarCell) => {
    const today = startOfDay(new Date());
    const dayIsToday = isSameDay(cell.date, today);
    const selected = isSameDay(cell.date, selectedDate);
    const hasDot = hasScheduledPayment(cell.date);

    return (
      <TouchableOpacity
        key={`${cell.date.toISOString()}-day`}
        style={styles.dayCellWrap}
        onPress={() => {
          setSelectedDate(startOfDay(cell.date));
          void Haptics.selectionAsync();
        }}
      >
        <View
          style={[
            styles.dayCircle,
            dayIsToday && styles.dayToday,
            selected && styles.daySelected,
          ]}
        >
          <Text
            style={[
              styles.dayText,
              !cell.isCurrentMonth && styles.dayTextOut,
              dayIsToday && styles.dayTextToday,
              selected && styles.dayTextSelected,
            ]}
          >
            {cell.day}
          </Text>
        </View>
        {hasDot ? <View style={styles.dayDot} /> : null}
      </TouchableOpacity>
    );
  };

  const renderPaymentRow = ({ item }: { item: LocalSchedule }) => {
    const status = statusFromSchedule(item, failedIdSet);
    const initials = item.recipient.slice(0, 2).toUpperCase();

    return (
      <TouchableOpacity style={styles.paymentRow} onPress={() => openDetailSheet(item)}>
        <View style={styles.paymentAvatar}>
          <Text style={styles.paymentAvatarText}>{initials}</Text>
        </View>

        <View style={styles.paymentMid}>
          <Text style={styles.paymentName}>Payment to {formatAddress(item.recipient)}</Text>
          <Text style={styles.paymentDesc}>{frequencyLabel(item)} · {formatDateTime(item.executeAt)}</Text>
        </View>

        <View style={styles.paymentRight}>
          <Text style={styles.paymentAmount}>{formatAmount(item.amount)}</Text>
          <StatusTag label={statusLabel(status)} variant={tagVariantForStatus(status)} />
        </View>
      </TouchableOpacity>
    );
  };

  const daysUntilUpcoming = useMemo(() => {
    if (!upcomingSchedule) return null;
    const now = Date.now();
    const target = upcomingSchedule.executeAt * 1000;
    return Math.max(0, Math.ceil((target - now) / (24 * 60 * 60 * 1000)));
  }, [upcomingSchedule]);

  if (isLoading) {
    return (
      <ScreenContainer style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C.brand.teal} />
          <Text style={styles.loadingText}>Loading scheduled payments...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={C.text.t1} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Scheduled Payments</Text>

        <TouchableOpacity style={styles.newBtn} onPress={openNewPaymentSheet}>
          <Ionicons name="add" size={14} color={C.text.t1} />
          <Text style={styles.newBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      {banner ? (
        <View style={[styles.banner, banner.tone === "error" ? styles.bannerError : styles.bannerSuccess]}>
          <Text style={[styles.bannerText, banner.tone === "error" ? styles.bannerTextError : styles.bannerTextSuccess]}>
            {banner.message}
          </Text>
        </View>
      ) : null}

      <View style={styles.monthNavRow}>
        <TouchableOpacity
          style={styles.monthArrow}
          onPress={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))}
        >
          <Ionicons name="chevron-back" size={18} color={C.text.t1} />
        </TouchableOpacity>

        <Text style={styles.monthTitle}>
          {monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </Text>

        <TouchableOpacity
          style={styles.monthArrow}
          onPress={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))}
        >
          <Ionicons name="chevron-forward" size={18} color={C.text.t1} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekHeaderRow}>
        {WEEK_DAYS.map((label) => (
          <Text key={label} style={styles.weekHeaderText}>{label}</Text>
        ))}
      </View>

      <View style={styles.calendarGrid}>{calendarCells.map(renderCalendarDay)}</View>

      {upcomingSchedule && daysUntilUpcoming !== null ? (
        <View style={styles.upcomingCard}>
          <Text style={styles.upcomingLead}>⏰ Next payment in {daysUntilUpcoming} day{daysUntilUpcoming === 1 ? "" : "s"}</Text>
          <Text style={styles.upcomingTitle}>{formatAmount(upcomingSchedule.amount)} ALGO → {formatAddress(upcomingSchedule.recipient)}</Text>
          <Text style={styles.upcomingDate}>{formatDateLabel(new Date(upcomingSchedule.executeAt * 1000))}</Text>
        </View>
      ) : null}

      <View style={styles.sectionHeadRow}>
        <Text style={styles.sectionHeadTitle}>{dayTitle}</Text>
        <Text style={styles.chainCountText}>On-chain: {chainCount ?? "-"}</Text>
      </View>

      <FlatList
        data={daySchedules}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderPaymentRow}
        contentContainerStyle={styles.paymentListContent}
        ListEmptyComponent={
          <View style={styles.emptyDayWrap}>
            <View style={styles.emptyDot} />
            <Text style={styles.emptyDayText}>No payments scheduled</Text>
          </View>
        }
      />

      <CrescaSheet
        sheetRef={newPaymentSheetRef}
        snapPoints={["90%"]}
        title="Schedule Payment"
      >
        <View style={styles.sheetContent}>
          <CrescaInput
            label="Recipient address"
            placeholder="Algorand address"
            value={recipientInput}
            onChangeText={(text) => {
              setRecipientInput(text.trim());
              setFormError(null);
            }}
            autoCapitalize="none"
          />

          <CrescaInput
            label="Amount"
            placeholder="0.00"
            keyboardType="decimal-pad"
            value={amountInput}
            onChangeText={(text) => {
              setAmountInput(sanitizeNumeric(text));
              setFormError(null);
            }}
          />

          <Text style={styles.sheetLabel}>Asset</Text>
          <View style={styles.pillRow}>
            {PAYMENT_ASSETS.map((asset) => {
              const active = selectedAsset === asset;
              return (
                <TouchableOpacity
                  key={asset}
                  style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
                  onPress={() => {
                    setSelectedAsset(asset);
                    setFormError(null);
                  }}
                >
                  <Text style={[styles.pillText, active ? styles.pillTextActive : styles.pillTextInactive]}>{asset}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sheetLabel}>Frequency</Text>
          <TouchableOpacity
            style={styles.selectorRow}
            onPress={() => {
              setFrequencyDraft(frequency);
              frequencySheetRef.current?.present();
            }}
          >
            <Text style={styles.selectorText}>{FREQUENCY_OPTIONS.find((option) => option.key === frequency)?.label}</Text>
            <Ionicons name="chevron-down" size={16} color={C.text.t2} />
          </TouchableOpacity>

          {frequency === "custom" ? (
            <CrescaInput
              label="Custom interval (days)"
              placeholder="7"
              keyboardType="number-pad"
              value={customDaysInput}
              onChangeText={(text) => setCustomDaysInput(text.replace(/[^0-9]/g, ""))}
            />
          ) : null}

          <Text style={styles.sheetLabel}>Start date</Text>
          <TouchableOpacity
            style={styles.selectorRow}
            onPress={() => {
              setStartDateDraft(startDate);
              setStartDateMonth(firstDayOfMonth(startDate));
              startDateSheetRef.current?.present();
            }}
          >
            <Text style={styles.selectorText}>{formatDateLabel(startDate)}</Text>
            <Ionicons name="calendar-outline" size={16} color={C.text.t2} />
          </TouchableOpacity>

          <Text style={styles.contractInfoText}>Calendar App ID: {CONTRACT_APP_IDS.CrescaCalendarPayments}</Text>

          {formError ? <Text style={styles.formErrorText}>{formError}</Text> : null}

          <PrimaryButton
            label="Schedule Payment"
            variant="black"
            loading={isSubmitting}
            onPress={handleCreateSchedule}
          />
        </View>
      </CrescaSheet>

      <CrescaSheet
        sheetRef={paymentDetailSheetRef}
        snapPoints={["70%"]}
        title="Payment Detail"
      >
        {selectedSchedule ? (
          <View style={styles.sheetContent}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Recipient</Text>
              <Text style={styles.detailValue}>{formatAddress(selectedSchedule.recipient)}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Amount</Text>
              <Text style={styles.detailValue}>{selectedSchedule.amount.toFixed(4)} ALGO</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Frequency</Text>
              <Text style={styles.detailValue}>{frequencyLabel(selectedSchedule)}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Next execution</Text>
              <Text style={styles.detailValue}>{formatDateTime(selectedSchedule.executeAt)}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Executed</Text>
              <Text style={styles.detailValue}>{selectedSchedule.executedCount}/{selectedSchedule.occurrences}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Tx hash</Text>
              <TouchableOpacity
                onPress={() => {
                  if (!selectedSchedule.txId) return;
                  void Linking.openURL(`https://lora.algokit.io/testnet/transaction/${selectedSchedule.txId}`);
                }}
              >
                <Text style={[styles.detailValue, styles.txLink]}>
                  {selectedSchedule.txId ? `${selectedSchedule.txId.slice(0, 8)}...` : "-"}
                </Text>
              </TouchableOpacity>
            </View>

            {selectedSchedule.active ? (
              <PrimaryButton
                label="Execute Now"
                variant="teal"
                loading={isExecuting}
                onPress={() => handleExecuteSchedule(selectedSchedule)}
              />
            ) : null}

            {selectedSchedule.active ? (
              <TouchableOpacity
                style={styles.dangerButton}
                onPress={() => handleCancelSchedule(selectedSchedule)}
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <ActivityIndicator size="small" color={C.semantic.danger} />
                ) : (
                  <Text style={styles.dangerButtonText}>Cancel Payment</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </CrescaSheet>

      <CrescaSheet
        sheetRef={frequencySheetRef}
        snapPoints={["50%"]}
        title="Payment Frequency"
      >
        <View style={styles.sheetContent}>
          {FREQUENCY_OPTIONS.map((option) => {
            const selected = frequencyDraft === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={styles.frequencyOption}
                onPress={() => setFrequencyDraft(option.key)}
              >
                <Ionicons
                  name={selected ? "radio-button-on" : "radio-button-off"}
                  size={18}
                  color={selected ? C.brand.black : C.text.t2}
                />
                <Text style={styles.frequencyLabel}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}

          <PrimaryButton
            label="Confirm"
            variant="black"
            onPress={() => {
              setFrequency(frequencyDraft);
              frequencySheetRef.current?.dismiss();
            }}
          />
        </View>
      </CrescaSheet>

      <CrescaSheet
        sheetRef={startDateSheetRef}
        snapPoints={["72%"]}
        title="Choose Start Date"
      >
        <View style={styles.sheetContent}>
          <View style={styles.startPickerMonthRow}>
            <TouchableOpacity
              style={styles.monthArrow}
              onPress={() =>
                setStartDateMonth(
                  new Date(startDateMonth.getFullYear(), startDateMonth.getMonth() - 1, 1),
                )
              }
            >
              <Ionicons name="chevron-back" size={18} color={C.text.t1} />
            </TouchableOpacity>

            <Text style={styles.monthTitle}>
              {startDateMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </Text>

            <TouchableOpacity
              style={styles.monthArrow}
              onPress={() =>
                setStartDateMonth(
                  new Date(startDateMonth.getFullYear(), startDateMonth.getMonth() + 1, 1),
                )
              }
            >
              <Ionicons name="chevron-forward" size={18} color={C.text.t1} />
            </TouchableOpacity>
          </View>

          <View style={styles.startPickerWeekRow}>
            {WEEK_DAYS.map((label) => (
              <Text key={`start-week-${label}`} style={styles.startPickerWeekText}>{label}</Text>
            ))}
          </View>

          <View style={styles.startPickerGrid}>
            {startDateCells.map((cell) => {
              const today = startOfDay(new Date());
              const isToday = isSameDay(cell.date, today);
              const selected = isSameDay(cell.date, startDateDraft);
              const disabled = startOfDay(cell.date).getTime() <= today.getTime();

              return (
                <TouchableOpacity
                  key={`start-day-${cell.date.toISOString()}`}
                  style={styles.startPickerDayWrap}
                  disabled={disabled}
                  onPress={() => {
                    setStartDateDraft(startOfDay(cell.date));
                    void Haptics.selectionAsync();
                  }}
                >
                  <View
                    style={[
                      styles.startPickerDayCircle,
                      isToday && styles.startPickerToday,
                      selected && styles.startPickerDaySelected,
                      disabled && styles.startPickerDayDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.startPickerDayText,
                        !cell.isCurrentMonth && styles.startPickerDayTextOut,
                        selected && styles.startPickerDayTextSelected,
                        disabled && styles.startPickerDayTextDisabled,
                      ]}
                    >
                      {cell.day}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.startPickerHelper}>
            Start date must be in the future.
          </Text>

          <PrimaryButton
            label="Use this date"
            variant="black"
            onPress={() => {
              setStartDate(startDateDraft);
              setFormError(null);
              startDateSheetRef.current?.dismiss();
            }}
          />
        </View>
      </CrescaSheet>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.surfaces.bgBase,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    ...T.body,
    color: C.text.t2,
  },
  headerRow: {
    height: 56,
    paddingHorizontal: H_PAD,
    borderBottomWidth: 1,
    borderBottomColor: C.borders.bDefault,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerIconBtn: {
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
  newBtn: {
    minHeight: 32,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    borderRadius: R.full,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  newBtnText: {
    ...T.smBold,
    color: C.text.t1,
  },
  banner: {
    marginHorizontal: H_PAD,
    marginTop: S.sm,
    borderWidth: 1,
    borderRadius: R.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bannerError: {
    backgroundColor: "rgba(240,68,56,0.08)",
    borderColor: C.semantic.danger,
  },
  bannerSuccess: {
    backgroundColor: "rgba(18,183,106,0.08)",
    borderColor: C.semantic.success,
  },
  bannerText: {
    ...T.sm,
  },
  bannerTextError: {
    color: C.semantic.danger,
  },
  bannerTextSuccess: {
    color: C.semantic.success,
  },
  monthNavRow: {
    marginTop: S.md,
    marginHorizontal: H_PAD,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  monthArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    backgroundColor: C.surfaces.bgSurface,
  },
  monthTitle: {
    ...T.bodyMd,
    color: C.text.t1,
  },
  weekHeaderRow: {
    marginTop: S.md,
    marginHorizontal: H_PAD,
    flexDirection: "row",
  },
  weekHeaderText: {
    flex: 1,
    textAlign: "center",
    ...T.sm,
    color: C.text.t2,
  },
  calendarGrid: {
    marginTop: S.sm,
    marginHorizontal: H_PAD,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCellWrap: {
    width: "14.2857%",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  dayToday: {
    borderWidth: 1,
    borderColor: C.brand.black,
  },
  daySelected: {
    backgroundColor: C.brand.black,
  },
  dayText: {
    ...T.body,
    color: C.text.t1,
  },
  dayTextOut: {
    color: C.text.t3,
  },
  dayTextToday: {
    color: C.text.t1,
  },
  dayTextSelected: {
    color: C.text.tInv,
  },
  dayDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.brand.teal,
    marginTop: 2,
  },
  upcomingCard: {
    marginTop: S.md,
    marginHorizontal: H_PAD,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.brand.teal,
    backgroundColor: "rgba(0,212,170,0.08)",
    padding: 14,
  },
  upcomingLead: {
    ...T.smBold,
    color: C.brand.tealDim,
  },
  upcomingTitle: {
    ...T.bodyMd,
    color: C.text.t1,
    marginTop: 4,
  },
  upcomingDate: {
    ...T.sm,
    color: C.text.t2,
    marginTop: 2,
  },
  sectionHeadRow: {
    marginTop: S.md,
    marginHorizontal: H_PAD,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionHeadTitle: {
    ...T.h3,
    color: C.text.t1,
    flex: 1,
    marginRight: 8,
  },
  chainCountText: {
    ...T.sm,
    color: C.text.t2,
  },
  paymentListContent: {
    marginTop: S.sm,
    paddingBottom: S.lg,
  },
  paymentRow: {
    marginHorizontal: H_PAD,
    borderBottomWidth: 1,
    borderBottomColor: C.borders.bDefault,
    minHeight: 64,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  paymentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surfaces.bgSurface,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentAvatarText: {
    ...T.smBold,
    color: C.text.t1,
  },
  paymentMid: {
    flex: 1,
  },
  paymentName: {
    ...T.bodyMd,
    color: C.text.t1,
  },
  paymentDesc: {
    ...T.sm,
    color: C.text.t2,
    marginTop: 2,
  },
  paymentRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  paymentAmount: {
    ...T.bodyMd,
    color: C.text.t1,
  },
  emptyDayWrap: {
    marginTop: S.md,
    marginHorizontal: H_PAD,
    minHeight: 88,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  emptyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.brand.teal,
  },
  emptyDayText: {
    ...T.sm,
    color: C.text.t2,
  },
  sheetContent: {
    gap: 12,
    paddingTop: 8,
  },
  sheetLabel: {
    ...T.smBold,
    color: C.text.t1,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    borderWidth: 1,
    borderRadius: R.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillActive: {
    backgroundColor: C.brand.black,
    borderColor: C.brand.black,
  },
  pillInactive: {
    backgroundColor: C.surfaces.bgSurface,
    borderColor: C.borders.bDefault,
  },
  pillText: {
    ...T.smBold,
  },
  pillTextActive: {
    color: C.text.tInv,
  },
  pillTextInactive: {
    color: C.text.t2,
  },
  selectorRow: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: C.borders.bDefault,
    borderRadius: R.sm,
    backgroundColor: C.surfaces.bgSurface,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  selectorText: {
    ...T.body,
    color: C.text.t1,
    flex: 1,
  },
  startPickerMonthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  startPickerWeekRow: {
    flexDirection: "row",
    marginTop: 4,
  },
  startPickerWeekText: {
    flex: 1,
    textAlign: "center",
    ...T.sm,
    color: C.text.t2,
  },
  startPickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 2,
  },
  startPickerDayWrap: {
    width: "14.2857%",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  startPickerDayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  startPickerToday: {
    borderWidth: 1,
    borderColor: C.brand.black,
  },
  startPickerDaySelected: {
    backgroundColor: C.brand.black,
  },
  startPickerDayDisabled: {
    backgroundColor: C.surfaces.bgSurface,
  },
  startPickerDayText: {
    ...T.body,
    color: C.text.t1,
  },
  startPickerDayTextOut: {
    color: C.text.t3,
  },
  startPickerDayTextSelected: {
    color: C.text.tInv,
  },
  startPickerDayTextDisabled: {
    color: C.text.t3,
  },
  startPickerHelper: {
    ...T.sm,
    color: C.text.t2,
  },
  contractInfoText: {
    ...T.address,
    color: C.text.t2,
  },
  formErrorText: {
    ...T.sm,
    color: C.semantic.danger,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.borders.bDefault,
    paddingBottom: 8,
  },
  detailLabel: {
    ...T.sm,
    color: C.text.t2,
  },
  detailValue: {
    ...T.bodyMd,
    color: C.text.t1,
    flex: 1,
    textAlign: "right",
  },
  txLink: {
    color: C.brand.purple,
  },
  dangerButton: {
    borderWidth: 1,
    borderColor: C.semantic.danger,
    borderRadius: R.full,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(240,68,56,0.04)",
  },
  dangerButtonText: {
    ...T.btn,
    color: C.semantic.danger,
  },
  frequencyOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 42,
  },
  frequencyLabel: {
    ...T.bodyMd,
    color: C.text.t1,
  },
});
