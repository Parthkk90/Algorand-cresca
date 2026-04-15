/**
 * Oracle Keeper Service
 * =====================
 * Runs on a 20-second interval, fetches live oracle prices for all tracked
 * Algorand ASAs, and pushes them to CrescaBucketProtocol.update_oracle() on-chain.
 *
 * This implements the "keeper pattern" described in the DART design spec:
 *   Deflex prices → keeper → update_oracle() → oracle_updated_at timestamp
 * open_position() and close_position() in the contract enforce a 30-second
 * staleness window — if the keeper misses two cycles, positions are blocked.
 *
 * Lifecycle:
 *   - Start on app init (called from app/_layout.tsx)
 *   - Stop on app teardown
 *   - Errors are swallowed and logged — a failed cycle never crashes the app
 */

import { dartRouterService } from './dartRouterService';
import { crescaBucketService } from './algorandContractServices';
import { algorandService } from './algorandService';

// Default tracked ASAs — ALGO (0) and USDCa (10458941) have confirmed testnet liquidity
export const DEFAULT_TRACKED_ASSET_IDS = [0, 10458941];

// ---------------------------------------------------------------------------
// OracleKeeperService
// ---------------------------------------------------------------------------

class OracleKeeperService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastTxId:        string | null = null;
  private lastTimestamp:   number | null = null;
  private isRunningCycle:  boolean = false;
  private warnedLowBalance: boolean = false;

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Start the keeper loop.
   *
   * @param trackedAssetIds  ASA IDs to price (default: ALGO + USDC)
   * @param intervalMs       Polling interval in ms (default: 20_000)
   */
  start(
    trackedAssetIds: number[] = DEFAULT_TRACKED_ASSET_IDS,
    intervalMs: number = 20_000,
  ): void {
    if (this.intervalId !== null) {
      console.log('⏱️  Oracle keeper already running');
      return;
    }

    console.log(
      `🔮 Oracle keeper starting — tracking ASAs [${trackedAssetIds.join(', ')}] every ${intervalMs / 1000}s`,
    );

    // Run one cycle immediately, then on interval
    this._runCycle(trackedAssetIds);
    this.intervalId = setInterval(() => this._runCycle(trackedAssetIds), intervalMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 Oracle keeper stopped');
    }
  }

  /** Unix timestamp (seconds) of the last successful on-chain oracle update. */
  getLastUpdateTimestamp(): number | null {
    return this.lastTimestamp;
  }

  /** Transaction ID of the last successful update_oracle() call. */
  getLastUpdateTxId(): string | null {
    return this.lastTxId;
  }

  /**
   * Returns true if the oracle was updated within the last `maxAgeSeconds`.
   * Mirrors the 30-second check enforced by the contract.
   */
  isOracleFresh(maxAgeSeconds: number = 30): boolean {
    if (this.lastTimestamp === null) return false;
    const ageSeconds = (Date.now() / 1000) - this.lastTimestamp;
    return ageSeconds <= maxAgeSeconds;
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private async _runCycle(_assetIds: number[]): Promise<void> {
    // Oracle prices are now pushed inline before each trade via Pyth pull model.
    // This keeper no longer performs on-chain updates.
  }
}

export const oracleKeeperService = new OracleKeeperService();
export default oracleKeeperService;
