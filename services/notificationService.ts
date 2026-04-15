/**
 * Notification Service
 * ====================
 * Expo Go (SDK 53+) no longer supports Android remote push notifications.
 *
 * To keep the app stable in Expo Go, this service is intentionally implemented
 * as a no-op stub. Calendar scheduling still works, but device notifications
 * are skipped until you move to a development build.
 */

export interface ScheduleNotificationInput {
  scheduleId:      number;
  recipient:       string;
  amountAlgo:      number;
  executeAt:       number;  // Unix timestamp (seconds)
}

class NotificationService {
  private warned = false;

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
    // Keep startup quiet in Expo Go; warn only when scheduling is attempted.
    return false;
  }

  /**
   * Schedule a local notification to fire when a payment is due.
   * Returns the notification identifier — store it in LocalSchedule
   * so you can cancel it later.
   *
   * If the executeAt time is already in the past (< 30s), fires immediately.
   */
  async schedulePaymentNotification(input: ScheduleNotificationInput): Promise<string> {
    void input;
    this.warnOnce();
    return '';
  }

  /**
   * Cancel a previously scheduled notification.
   * Call when the user executes or cancels a schedule.
   */
  async cancelNotification(notificationId: string | undefined): Promise<void> {
    void notificationId;
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
    return;
  }
}

export const notificationService = new NotificationService();
export default notificationService;
