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

const KEY = 'cresca_open_positions_v1';

export interface StoredPosition {
  positionId: number;
  bucketId:   number;
  basketId:   string;
  asaIds:     number[];
  leverage:   number;
  marginAlgo: number;
  openedAt:   number;   // Unix ms
  txId:       string;
}

class PositionStore {
  async getAll(): Promise<StoredPosition[]> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as StoredPosition[]) : [];
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

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(KEY);
  }
}

export const positionStore = new PositionStore();
export default positionStore;
