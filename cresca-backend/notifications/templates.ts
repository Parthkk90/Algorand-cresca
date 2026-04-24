/**
 * Notification Templates
 * ======================
 * Pre-formatted notification messages for all keeper events.
 */

function truncAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export const TEMPLATES = {
  /** Scheduled payment was executed by the keeper */
  paymentExecuted: (amountAlgo: string, recipient: string) => ({
    title: '✅ Payment Sent',
    body: `${amountAlgo} ALGO sent to ${truncAddr(recipient)}`,
  }),

  /** User received a payment from a schedule */
  paymentReceived: (amountAlgo: string, sender: string) => ({
    title: '💰 Payment Received',
    body: `${amountAlgo} ALGO received from ${truncAddr(sender)}`,
  }),

  /** Upcoming scheduled payment reminder (fire 5 min before) */
  paymentUpcoming: (amountAlgo: string, minutesUntil: number) => ({
    title: '⏰ Upcoming Payment',
    body: `${amountAlgo} ALGO payment due in ${minutesUntil} minute${minutesUntil === 1 ? '' : 's'}`,
  }),

  /** Position was liquidated */
  positionLiquidated: (positionId: number) => ({
    title: '⚠️ Position Liquidated',
    body: `Position #${positionId} was liquidated due to insufficient margin`,
  }),

  /** Position approaching liquidation threshold */
  positionAtRisk: (positionId: number, healthPct: number) => ({
    title: '🔴 Position at Risk',
    body: `Position #${positionId} health: ${healthPct.toFixed(1)}% — add margin to avoid liquidation`,
  }),

  /** Oracle is stale — trading paused */
  oracleStale: () => ({
    title: '🔮 Oracle Warning',
    body: 'Oracle prices are stale — trading is temporarily paused',
  }),

  /** Keeper wallet balance low */
  keeperLowBalance: (balanceAlgo: string) => ({
    title: '🤖 Keeper Alert',
    body: `Keeper wallet balance: ${balanceAlgo} ALGO — refund needed`,
  }),
};
