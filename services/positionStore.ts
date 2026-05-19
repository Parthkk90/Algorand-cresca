/**
 * Position Store
 * ==============
 * Persists open leveraged positions to AsyncStorage so the Bundles
 * screen can display P&L and offer one-tap close.
 *
 * The contract itself is the source of truth — this store is just a
 * local index that maps positionId → basket metadata so we know which
 * box references to pass when calling closePosition.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONTRACT_APP_IDS } from '../constants/config';

const KEY = 'cresca_open_positions_v1';

export interface StoredPosition {
  positionId: number;
  bucketId:   number;
  /** App ID of the bucket contract this position was opened on. Used to
   *  hide positions that are orphans after a contract redeploy. Optional
   *  for back-compat with pre-existing local entries. */
  appId?:     number;
  basketId:   string;
  asaIds:     number[];
  leverage:   number;
  marginAlgo: number;
  openedAt:   number;   // Unix ms
  txId:       string;
  closedAt?:  number;   // Unix ms — set when position is closed on-chain but funds not yet withdrawn
  closeTxId?: string;
  realizedPnlAlgo?: number;
}

class PositionStore {
  async getAll(): Promise<StoredPosition[]> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as StoredPosition[];
      // Filter out positions opened against a previous (now-orphaned)
      // bucket contract. Untagged entries are treated as orphans too —
      // their position IDs are guaranteed not to exist on the new app.
      const currentAppId = CONTRACT_APP_IDS.CrescaBucketProtocol;
      const active = parsed.filter(
        (p) => p.appId === currentAppId,
      );
      if (active.length !== parsed.length) {
        // Persist the pruned list so the next read is cheap.
        await AsyncStorage.setItem(KEY, JSON.stringify(active));
      }
      return active;
    } catch {
      return [];
    }
  }

  async add(position: StoredPosition): Promise<void> {
    const all = await this.getAll();
    // Avoid duplicate positionIds
    const deduped = all.filter((p) => p.positionId !== position.positionId);
    deduped.push(position);
    await AsyncStorage.setItem(KEY, JSON.stringify(deduped));
  }

  async remove(positionId: number): Promise<void> {
    const all = await this.getAll();
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify(all.filter((p) => p.positionId !== positionId)),
    );
  }

  async markClosed(
    positionId: number,
    info: { closeTxId: string; realizedPnlAlgo: number },
  ): Promise<void> {
    const all = await this.getAll();
    const next = all.map((p) =>
      p.positionId === positionId
        ? { ...p, closedAt: Date.now(), closeTxId: info.closeTxId, realizedPnlAlgo: info.realizedPnlAlgo }
        : p,
    );
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  }

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(KEY);
  }
}

export const positionStore = new PositionStore();
export default positionStore;
