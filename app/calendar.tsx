import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import algosdk from 'algosdk';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ScreenContainer } from '../components/ScreenContainer';
import { HapticButton } from '../components/HapticButton';
import { InlineError } from '../components/InlineError';
import { Anim, Colors, Radius, Shadow, Spacing, Typography } from '../constants/theme';
import { algorandService } from '../services/algorandService';
import { crescaCalendarService } from '../services/algorandContractServices';
import { notificationService } from '../services/notificationService';

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
  notificationId?: string;  // tracks the scheduled local notification
};

const schedulesKey = (address: string) => `calendar_schedules_${address}`;

export default function CalendarScreen() {
  const [walletAddress, setWalletAddress] = useState('');
  const [balance, setBalance] = useState('0.000');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [schedules, setSchedules] = useState<LocalSchedule[]>([]);
  const [chainCount, setChainCount] = useState<number | null>(null);

  // Inline validation errors for create form
  const [recipientError, setRecipientError] = useState('');
  const [amountError, setAmountError] = useState('');

  // Animated bottom sheet for create modal
  const sheetY = useSharedValue(800);
  const sheetOpacity = useSharedValue(0);

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
    opacity: sheetOpacity.value,
  }));

  const scrimAnimStyle = useAnimatedStyle(() => ({
    opacity: sheetOpacity.value,
  }));

  const openSheet = () => {
    setShowCreateModal(true);
    sheetOpacity.value = withTiming(1, { duration: Anim.fast });
    sheetY.value = withSpring(0, Anim.springModal);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const closeSheet = () => {
    sheetOpacity.value = withTiming(0, { duration: Anim.fast });
    sheetY.value = withTiming(700, { duration: Anim.fast });
    setTimeout(() => setShowCreateModal(false), Anim.fast);
  };

  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [intervalDays, setIntervalDays] = useState('7');
  const [selectedHour, setSelectedHour] = useState('12');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>('PM');
  const [notice, setNotice] = useState<{
    title: string;
    message: string;
    tone: AppNoticeTone;
    actions?: AppNoticeAction[];
  } | null>(null);

  useEffect(() => {
    void initialize();
  }, []);

  const activeSchedules = useMemo(() => schedules.filter((s) => s.active), [schedules]);

  const initialize = async () => {
    try {
      const wallet = await algorandService.initializeWallet();
      const bal = await algorandService.getBalance();

      setWalletAddress(wallet.address);
      setBalance(parseFloat(bal.algo).toFixed(3));

      await loadLocalSchedules(wallet.address);
      await refreshOnChainCount(wallet.address);
    } catch (error) {
      console.error('Calendar init error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadLocalSchedules = async (address: string) => {
    try {
      const raw = await AsyncStorage.getItem(schedulesKey(address));
      setSchedules(raw ? (JSON.parse(raw) as LocalSchedule[]) : []);
    } catch (error) {
      console.warn('Failed to load local schedules:', error);
      setSchedules([]);
    }
  };

  const persistSchedules = async (next: LocalSchedule[]) => {
    setSchedules(next);
    if (!walletAddress) return;
    await AsyncStorage.setItem(String(schedulesKey(walletAddress)), String(JSON.stringify(next)));
  };

  const refreshOnChainCount = async (address: string) => {
    try {
      const count = await crescaCalendarService.getUserScheduleCount(address);
      setChainCount(count);
    } catch (error) {
      console.warn('Could not fetch on-chain schedule count:', error);
    }
  };

  const formatAddress = (address: string) =>
    address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : '';

  const formatDateTime = (timestamp: number) =>
    new Date(timestamp * 1000).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const renderCalendarDays = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days: { day: number; isCurrentMonth: boolean; date: Date }[] = [];

    const prevMonthDays = getDaysInMonth(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    for (let i = firstDay - 1; i >= 0; i -= 1) {
      days.push({
        day: prevMonthDays - i,
        isCurrentMonth: false,
        date: new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, prevMonthDays - i),
      });
    }

    for (let i = 1; i <= daysInMonth; i += 1) {
      days.push({
        day: i,
        isCurrentMonth: true,
        date: new Date(currentDate.getFullYear(), currentDate.getMonth(), i),
      });
    }

    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i += 1) {
      days.push({
        day: i,
        isCurrentMonth: false,
        date: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, i),
      });
    }

    return days;
  };

  const isToday = (date: Date) => {
    const now = new Date();
    return now.getDate() === date.getDate() && now.getMonth() === date.getMonth() && now.getFullYear() === date.getFullYear();
  };

  const hasScheduledPayment = (date: Date) =>
    activeSchedules.some((s) => {
      const d = new Date(s.executeAt * 1000);
      return d.getDate() === date.getDate() && d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear();
    });

  const to24hHour = (hour12: number, period: 'AM' | 'PM') => {
    if (period === 'AM') return hour12 === 12 ? 0 : hour12;
    return hour12 === 12 ? 12 : hour12 + 12;
  };

  const handleCreateSchedule = async () => {
    setRecipientError('');
    setAmountError('');

    let hasError = false;

    if (!recipientAddress.trim() || !algosdk.isValidAddress(recipientAddress.trim())) {
      setRecipientError('Enter a valid Algorand address.');
      hasError = true;
    }

    const amountNum = parseFloat(amount);
    const daysNum = parseInt(intervalDays, 10);
    if (!amount || !Number.isFinite(amountNum) || amountNum <= 0) {
      setAmountError('Enter a valid amount greater than 0.');
      hasError = true;
    }

    if (!selectedDate) {
      setAmountError((prev) => prev || 'Select a date before scheduling.');
      hasError = true;
    }

    if (hasError) return;

    const hourNum = Math.max(1, Math.min(12, parseInt(selectedHour || '12', 10) || 12));
    const minuteNum = Math.max(0, Math.min(59, parseInt(selectedMinute || '0', 10) || 0));
    const executionDate = new Date(selectedDate!);
    executionDate.setHours(to24hHour(hourNum, selectedPeriod), minuteNum, 0, 0);

    const executeAt = Math.floor(executionDate.getTime() / 1000);
    if (executeAt <= Math.floor(Date.now() / 1000)) {
      setAmountError('Execution time must be in the future.');
      return;
    }

    try {
      setIsCreating(true);

      const intervalSeconds = (daysNum > 0 ? daysNum : 7) * 24 * 60 * 60;
      const occurrences = 12;

      const result = await crescaCalendarService.createSchedule(
        recipientAddress.trim(),
        amountNum,
        executeAt,
        intervalSeconds,
        occurrences,
      );

      const notificationId = await notificationService.schedulePaymentNotification({
        scheduleId: result.scheduleId,
        recipient:  recipientAddress.trim(),
        amountAlgo: amountNum,
        executeAt,
      });

      const nextLocal: LocalSchedule = {
        id: result.scheduleId,
        recipient: recipientAddress.trim(),
        amount: amountNum,
        executeAt,
        intervalSeconds,
        occurrences,
        executedCount: 0,
        active: true,
        txId: result.txId,
        notificationId,
      };

      await persistSchedules([nextLocal, ...schedules]);
      await refreshOnChainCount(walletAddress);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeSheet();

      setRecipientAddress('');
      setAmount('');
      setIntervalDays('7');
      setSelectedHour('12');
      setSelectedMinute('00');
      setSelectedPeriod('PM');

      const bal = await algorandService.getBalance();
      setBalance(parseFloat(bal.algo).toFixed(3));
    } catch (error: any) {
      setAmountError(error?.message || 'Failed to create schedule. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleExecuteSchedule = async (scheduleId: number) => {
    try {
      const schedule = schedules.find((s) => s.id === scheduleId);
      const txId = await crescaCalendarService.executeSchedule(
        walletAddress,
        scheduleId,
        schedule?.recipient,
      );
      const explorerUrl = `https://lora.algokit.io/testnet/transaction/${txId}`;

      // Cancel the notification that fired (or was pending) for this execution
      await notificationService.cancelNotification(schedule?.notificationId);

      const next = await Promise.all(
        schedules.map(async (s) => {
          if (s.id !== scheduleId) return s;
          const nextExecuted = Math.min(s.executedCount + 1, s.occurrences);
          const stillActive  = nextExecuted < s.occurrences;
          const nextExecuteAt = s.executeAt + s.intervalSeconds;

          // Schedule notification for the next occurrence if still active
          let nextNotificationId: string | undefined;
          if (stillActive) {
            nextNotificationId = await notificationService.rescheduleNextNotification({
              scheduleId: s.id,
              recipient:  s.recipient,
              amountAlgo: s.amount,
              executeAt:  nextExecuteAt,
            });
          }

          return {
            ...s,
            executedCount:  nextExecuted,
            active:         stillActive,
            executeAt:      nextExecuteAt,
            notificationId: nextNotificationId,
          };
        }),
      );

      await persistSchedules(next);

      setNotice({
        title: 'Payment Executed',
        message: `Schedule #${scheduleId} executed.`,
        tone: 'success',
        actions: [
          { label: 'View Tx', style: 'secondary', onPress: () => Linking.openURL(explorerUrl) },
          { label: 'OK', style: 'primary' },
        ],
      });

      const bal = await algorandService.getBalance();
      setBalance(parseFloat(bal.algo).toFixed(3));
    } catch (error: any) {
      setNotice({
        title: 'Execute Failed',
        message: error?.message || 'Failed to execute payment',
        tone: 'error',
      });
    }
  };

  const handleCancelSchedule = async (scheduleId: number) => {
    setNotice({
      title: 'Cancel Schedule',
      message: `Cancel schedule #${scheduleId}?`,
      tone: 'info',
      actions: [
        { label: 'No', style: 'secondary' },
        {
          label: 'Yes, Cancel',
          style: 'danger',
          onPress: async () => {
            try {
              const schedule = schedules.find((s) => s.id === scheduleId);
              const txId = await crescaCalendarService.cancelSchedule(scheduleId);
              const explorerUrl = `https://lora.algokit.io/testnet/transaction/${txId}`;

              await notificationService.cancelNotification(schedule?.notificationId);

              const next = schedules.map((s) =>
                s.id === scheduleId ? { ...s, active: false, notificationId: undefined } : s,
              );
              await persistSchedules(next);

              setNotice({
                title: 'Schedule Cancelled',
                message: `Schedule #${scheduleId} cancelled.`,
                tone: 'success',
                actions: [
                  { label: 'View Tx', style: 'secondary', onPress: () => Linking.openURL(explorerUrl) },
                  { label: 'OK', style: 'primary' },
                ],
              });
            } catch (error: any) {
              setNotice({
                title: 'Cancel Failed',
                message: error?.message || 'Failed to cancel schedule',
                tone: 'error',
              });
            }
          },
        },
      ],
    });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.navy} />
      </View>
    );
  }

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Calendar Payments</Text>
          <Text style={styles.walletId}>{formatAddress(walletAddress)} · {balance} ALGO</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.calendarContainer}>
          <View style={styles.monthNavigation}>
            <Text style={styles.monthYear}>{currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
            <View style={styles.navigationButtons}>
              <TouchableOpacity onPress={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} style={styles.navButton}>
                <Ionicons name="chevron-back" size={18} color={Colors.navy} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCurrentDate(new Date())} style={styles.todayButton}>
                <Text style={styles.todayText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} style={styles.navButton}>
                <Ionicons name="chevron-forward" size={18} color={Colors.navy} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.weekDays}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
              <View key={`${day}-${index}`} style={styles.weekDay}>
                <Text style={styles.weekDayText}>{day}</Text>
              </View>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {renderCalendarDays().map((item, index) => (
              <TouchableOpacity
                key={`${item.day}-${index}`}
                style={[styles.calendarDay, !item.isCurrentMonth && styles.calendarDayInactive, isToday(item.date) && styles.calendarDayToday]}
                onPress={() => {
                  setSelectedDate(item.date);
                  void Haptics.selectionAsync();
                  openSheet();
                }}
                accessibilityRole="button"
                accessibilityLabel={`${item.day} ${currentDate.toLocaleString('default', { month: 'long' })}${hasScheduledPayment(item.date) ? ', has scheduled payment' : ''}`}
                accessibilityState={{ selected: selectedDate?.toDateString() === item.date.toDateString() }}
              >
                <Text style={[styles.calendarDayText, !item.isCurrentMonth && styles.calendarDayTextInactive, isToday(item.date) && styles.calendarDayTextToday]}>
                  {item.day}
                </Text>
                {hasScheduledPayment(item.date) ? <View style={styles.scheduleDot} /> : null}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.schedulesListContainer}>
          <View style={styles.titleRow}>
            <Text style={styles.schedulesListTitle}>Scheduled Payments</Text>
            <Text style={styles.chainCount}>On-chain: {chainCount ?? '-'}</Text>
          </View>

          {schedules.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={56} color={Colors.sky} />
              <Text style={styles.emptyTitle}>No schedules yet</Text>
              <Text style={styles.emptyText}>Tap any date to create your first recurring payment.</Text>
            </View>
          ) : (
            schedules.map((schedule) => (
              <View key={schedule.id} style={styles.scheduleCard}>
                <View style={styles.scheduleHeader}>
                  <Text style={styles.scheduleAmount}>{schedule.amount.toFixed(4)} ALGO</Text>
                  <View style={[styles.statusBadge, schedule.active ? styles.statusActive : styles.statusInactive]}>
                    <Text style={styles.statusText}>{schedule.active ? 'Active' : 'Inactive'}</Text>
                  </View>
                </View>

                <Text style={styles.scheduleRecipient}>To: {formatAddress(schedule.recipient)}</Text>
                <Text style={styles.scheduleMeta}>Next: {formatDateTime(schedule.executeAt)}</Text>
                <Text style={styles.scheduleMeta}>Every {Math.floor(schedule.intervalSeconds / 86400)} days · {schedule.executedCount}/{schedule.occurrences}</Text>

                <View style={styles.scheduleActions}>
                  {schedule.active ? (
                    <>
                      <TouchableOpacity style={[styles.actionButton, styles.actionButtonPrimary]} onPress={() => handleExecuteSchedule(schedule.id)}>
                        <Text style={styles.actionButtonTextPrimary}>Execute</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionButton, styles.actionButtonSecondary]} onPress={() => handleCancelSchedule(schedule.id)}>
                        <Text style={styles.actionButtonText}>Cancel</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.actionButtonSecondary, { flex: 1 }]}
                      onPress={() => persistSchedules(schedules.filter((s) => s.id !== schedule.id))}
                    >
                      <Text style={styles.actionButtonText}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Animated bottom sheet — replaces Modal */}
      {showCreateModal && (
        <>
          <Reanimated.View style={[styles.scrim, scrimAnimStyle]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeSheet} />
          </Reanimated.View>
          <Reanimated.View style={[styles.sheet, sheetAnimStyle]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Schedule</Text>
              <TouchableOpacity
                onPress={closeSheet}
                accessibilityRole="button"
                accessibilityLabel="Close create schedule sheet"
                hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
              >
                <Ionicons name="close" size={22} color={Colors.navy} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {selectedDate ? (
                <View style={styles.selectedDateCard}>
                  <Ionicons name="calendar" size={18} color={Colors.navy} />
                  <Text style={styles.selectedDateText}>{selectedDate.toDateString()}</Text>
                </View>
              ) : null}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Recipient</Text>
                <TextInput
                  style={styles.input}
                  value={recipientAddress}
                  onChangeText={(v) => { setRecipientAddress(v); setRecipientError(''); }}
                  placeholder="Algorand address"
                  placeholderTextColor={Colors.sky}
                  autoCapitalize="none"
                  accessibilityLabel="Recipient Algorand address"
                />
                <InlineError message={recipientError} />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Amount (ALGO)</Text>
                <TextInput
                  style={styles.input}
                  value={amount}
                  onChangeText={(v) => { setAmount(v); setAmountError(''); }}
                  placeholder="0.0"
                  placeholderTextColor={Colors.sky}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Amount in ALGO"
                />
                <InlineError message={amountError} />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Repeat every (days)</Text>
                <TextInput
                  style={styles.input}
                  value={intervalDays}
                  onChangeText={setIntervalDays}
                  placeholder="7"
                  placeholderTextColor={Colors.sky}
                  keyboardType="number-pad"
                  accessibilityLabel="Repeat interval in days"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Execution Time</Text>
                <View style={styles.timeRow}>
                  <TextInput
                    style={[styles.input, styles.timeInput]}
                    value={selectedHour}
                    onChangeText={setSelectedHour}
                    keyboardType="number-pad"
                    maxLength={2}
                    accessibilityLabel="Hour"
                  />
                  <Text style={styles.timeSeparator}>:</Text>
                  <TextInput
                    style={[styles.input, styles.timeInput]}
                    value={selectedMinute}
                    onChangeText={setSelectedMinute}
                    keyboardType="number-pad"
                    maxLength={2}
                    accessibilityLabel="Minute"
                  />
                  <HapticButton
                    style={styles.periodButton}
                    onPress={() => setSelectedPeriod((p) => (p === 'AM' ? 'PM' : 'AM'))}
                    accessibilityLabel={`Toggle AM/PM, currently ${selectedPeriod}`}
                  >
                    <Text style={styles.periodText}>{selectedPeriod}</Text>
                  </HapticButton>
                </View>
              </View>

              <HapticButton
                style={isCreating ? [styles.createButton, styles.createButtonDisabled] : [styles.createButton]}
                onPress={handleCreateSchedule}
                disabled={isCreating}
                accessibilityLabel={isCreating ? 'Creating schedule' : 'Create payment schedule'}
                hapticStyle={Haptics.ImpactFeedbackStyle.Medium}
              >
                {isCreating ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.createButtonText}>Create Schedule</Text>
                )}
              </HapticButton>
            </ScrollView>
          </Reanimated.View>
        </>
      )}

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
  container: { flex: 1, backgroundColor: Colors.bg.screen },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg.screen },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.navy },
  walletId: { marginTop: 2, fontSize: Typography.xs, color: Colors.steel },
  content: { flex: 1 },

  calendarContainer: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    ...Shadow.card,
  },
  monthNavigation: { marginBottom: Spacing.lg },
  monthYear: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.navy, marginBottom: Spacing.md },
  navigationButtons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  navButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bg.input, alignItems: 'center', justifyContent: 'center' },
  todayButton: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.bg.input },
  todayText: { color: Colors.navy, fontWeight: Typography.semibold, fontSize: Typography.sm },

  weekDays: { flexDirection: 'row', marginBottom: Spacing.sm },
  weekDay: { flex: 1, alignItems: 'center' },
  weekDayText: { fontSize: Typography.xs, color: Colors.steel, fontWeight: Typography.semibold },

  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarDay: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  calendarDayInactive: { opacity: 0.28 },
  calendarDayToday: { backgroundColor: Colors.navy, borderRadius: Radius.full },
  calendarDayText: { color: Colors.navy, fontSize: Typography.base },
  calendarDayTextInactive: { color: Colors.steel },
  calendarDayTextToday: { color: Colors.white, fontWeight: Typography.bold },
  scheduleDot: { position: 'absolute', bottom: 5, width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.steel },

  schedulesListContainer: { paddingHorizontal: Spacing.xl, paddingBottom: 40 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  schedulesListTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.navy },
  chainCount: { fontSize: Typography.xs, color: Colors.steel },

  emptyState: { alignItems: 'center', paddingVertical: 36 },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.navy, marginTop: 8 },
  emptyText: { fontSize: Typography.sm, color: Colors.steel, marginTop: 6, textAlign: 'center', lineHeight: 20 },

  scheduleCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.subtle,
  },
  scheduleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  scheduleAmount: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.navy },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  statusActive: { backgroundColor: Colors.gainBg },
  statusInactive: { backgroundColor: Colors.lossBg },
  statusText: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.steel },
  scheduleRecipient: { fontSize: Typography.sm, color: Colors.steel, marginBottom: 4 },
  scheduleMeta: { fontSize: Typography.xs, color: Colors.steel, marginBottom: 2 },

  scheduleActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  actionButton: { flex: 1, borderRadius: Radius.sm, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  actionButtonPrimary: { backgroundColor: Colors.steel, borderColor: Colors.steel },
  actionButtonSecondary: { backgroundColor: Colors.white, borderColor: Colors.border },
  actionButtonText: { color: Colors.steel, fontSize: Typography.sm, fontWeight: Typography.semibold },
  actionButtonTextPrimary: { color: Colors.white, fontSize: Typography.sm, fontWeight: Typography.semibold },

  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 10,
  } as any,
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.bg.card,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    paddingBottom: 40,
    zIndex: 11,
    maxHeight: '88%',
  } as any,
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(6,14,32,0.72)' },
  modalContent: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%' },
  modalHeader: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.navy },
  modalScroll: { padding: Spacing.xl },
  selectedDateCard: {
    backgroundColor: Colors.bg.subtle,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectedDateText: { color: Colors.navy, fontSize: Typography.sm, fontWeight: Typography.semibold },

  inputGroup: { marginBottom: Spacing.lg },
  inputLabel: { marginBottom: 6, color: Colors.steel, fontSize: Typography.sm, fontWeight: Typography.semibold },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg.input,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    color: Colors.navy,
    fontSize: Typography.base,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  timeInput: { flex: 1, textAlign: 'center' },
  timeSeparator: { color: Colors.navy, fontSize: Typography.xl, fontWeight: Typography.bold },
  periodButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg.input,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  periodText: { color: Colors.navy, fontWeight: Typography.semibold },

  createButton: {
    backgroundColor: Colors.navy,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  createButtonDisabled: { opacity: 0.55 },
  createButtonText: { color: Colors.white, fontSize: Typography.base, fontWeight: Typography.bold },
});