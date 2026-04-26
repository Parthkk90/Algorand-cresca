/**
 * Notification Service
 * ====================
 * Push notification management for the Cresca wallet.
 *
 * Expo Go (SDK 53+) no longer supports Android remote push notifications.
 * Local scheduling is a no-op in Expo Go, but this service now includes
 * push token registration with the Cresca backend so the plumbing is
 * ready when moving to a development build.
 */

import { backendFetch } from './backendConfig';

export interface ScheduleNotificationInput {
  scheduleId:      number;
  recipient:       string;
  amountAlgo:      number;
  executeAt:       number;  // Unix timestamp (seconds)
}

/**
 * Whether we're running in a full dev/production build (not Expo Go).
 * Push notifications only work in dev builds.
 */
function isDevBuild(): boolean {
  try {
    // expo-constants is available in all Expo environments
    const Constants = require('expo-constants').default;
    return Constants.appOwnership !== 'expo'; // 'expo' = Expo Go
  } catch {
    return false;
  }
}

class NotificationService {
  private warned = false;
  private pushToken: string | null = null;

  private warnOnce(): void {
    if (this.warned) return;
    this.warned = true;
    console.warn('⚠️ Notifications are disabled in Expo Go. Use a development build to enable them.');
  }

  /**
   * Request notification permissions.
   * Call once on app start or when the Calendar screen mounts.
   * Safe to call multiple times — does nothing if already granted.
   */
  async requestPermissions(): Promise<boolean> {
    if (!isDevBuild()) {
      // Keep startup quiet in Expo Go
      return false;
    }

    try {
      const Notifications = require('expo-notifications');
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;

      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Push notification permission denied');
        return false;
      }

      // Get the Expo push token
      const tokenData = await Notifications.getExpoPushTokenAsync();
      this.pushToken = tokenData.data;
      console.log('📱 Push token obtained:', this.pushToken?.substring(0, 30) + '...');

      return true;
    } catch (err) {
      console.warn('Failed to request push permissions:', err);
      return false;
    }
  }

  /**
   * Register the push token with the Cresca backend.
   * Call after requestPermissions() succeeds and the wallet address is known.
   *
   * The backend stores the token mapping so the keeper bot can send
   * notifications when schedules execute or positions get liquidated.
   */
  async registerPushToken(walletAddress: string): Promise<boolean> {
    if (!this.pushToken) {
      console.log('No push token available — skipping registration');
      return false;
    }

    if (!walletAddress) {
      console.warn('No wallet address provided — skipping push registration');
      return false;
    }

    const platform = (() => {
      try {
        const { Platform } = require('react-native');
        return Platform.OS ?? 'unknown';
      } catch {
        return 'unknown';
      }
    })();

    const result = await backendFetch<{ success: boolean }>('/api/push/register', {
      method: 'POST',
      body: JSON.stringify({
        pushToken: this.pushToken,
        walletAddress,
        platform,
      }),
    });

    if (result.ok) {
      console.log('✅ Push token registered with backend');
      return true;
    } else {
      console.warn('Failed to register push token:', result.error);
      return false;
    }
  }

  /**
   * Schedule a local notification to fire when a payment is due.
   * Returns the notification identifier — store it in LocalSchedule
   * so you can cancel it later.
   *
   * If the executeAt time is already in the past (< 30s), fires immediately.
   */
  async schedulePaymentNotification(input: ScheduleNotificationInput): Promise<string> {
    if (!isDevBuild()) {
      this.warnOnce();
      return '';
    }

    try {
      const Notifications = require('expo-notifications');
      const now = Math.floor(Date.now() / 1000);
      const delay = Math.max(1, input.executeAt - now);

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: '💸 Payment Due',
          body: `${input.amountAlgo.toFixed(6)} ALGO → ${input.recipient.slice(0, 8)}...`,
          data: { scheduleId: input.scheduleId },
        },
        trigger: { seconds: delay },
      });

      return id;
    } catch (err) {
      console.warn('Failed to schedule notification:', err);
      return '';
    }
  }

  /**
   * Cancel a previously scheduled notification.
   * Call when the user executes or cancels a schedule.
   */
  async cancelNotification(notificationId: string | undefined): Promise<void> {
    if (!notificationId || !isDevBuild()) return;

    try {
      const Notifications = require('expo-notifications');
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (err) {
      console.warn('Failed to cancel notification:', err);
    }
  }

  /**
   * After a recurring schedule executes, schedule the NEXT notification.
   * Pass the new executeAt (= old executeAt + intervalSeconds).
   */
  async rescheduleNextNotification(input: ScheduleNotificationInput): Promise<string> {
    return this.schedulePaymentNotification(input);
  }

  /**
   * Cancel ALL pending payment notifications (e.g. on wallet reset).
   */
  async cancelAllNotifications(): Promise<void> {
    if (!isDevBuild()) return;

    try {
      const Notifications = require('expo-notifications');
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (err) {
      console.warn('Failed to cancel all notifications:', err);
    }
  }

  /**
   * Get the current push token (if obtained).
   */
  getPushToken(): string | null {
    return this.pushToken;
  }
}

export const notificationService = new NotificationService();
export default notificationService;
