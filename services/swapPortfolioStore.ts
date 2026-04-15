import AsyncStorage from '@react-native-async-storage/async-storage';

export interface StoredSwapAsset {
  symbol: string;
  asaId: number;
  amount: number;
  updatedAt: number;
}

const keyForAddress = (address: string) => `swap_portfolio_${address}`;

class SwapPortfolioStore {
  async getAll(address: string): Promise<StoredSwapAsset[]> {
    if (!address) return [];
    const raw = await AsyncStorage.getItem(keyForAddress(address));
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw) as StoredSwapAsset[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async getAmount(address: string, symbol: string): Promise<number> {
    const all = await this.getAll(address);
    const row = all.find((a) => a.symbol === symbol.toUpperCase());
    return row?.amount ?? 0;
  }

  async applySwap(
    address: string,
    from: { symbol: string; asaId: number; amount: number },
    to: { symbol: string; asaId: number; amount: number },
  ): Promise<StoredSwapAsset[]> {
    const all = await this.getAll(address);
    const next = [...all];

    const fromSymbol = from.symbol.toUpperCase();
    const toSymbol = to.symbol.toUpperCase();

    if (fromSymbol !== 'ALGO') {
      const idx = next.findIndex((a) => a.symbol === fromSymbol);
      const current = idx >= 0 ? next[idx].amount : 0;
      const updated = Math.max(0, current - from.amount);

      if (idx >= 0) {
        next[idx] = {
          ...next[idx],
          amount: updated,
          updatedAt: Date.now(),
        };
      } else {
        next.push({
          symbol: fromSymbol,
          asaId: from.asaId,
          amount: 0,
          updatedAt: Date.now(),
        });
      }
    }

    const toIdx = next.findIndex((a) => a.symbol === toSymbol);
    if (toIdx >= 0) {
      next[toIdx] = {
        ...next[toIdx],
        amount: next[toIdx].amount + to.amount,
        asaId: to.asaId,
        updatedAt: Date.now(),
      };
    } else {
      next.push({
        symbol: toSymbol,
        asaId: to.asaId,
        amount: to.amount,
        updatedAt: Date.now(),
      });
    }

    const pruned = next
      .filter((a) => a.amount > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    await AsyncStorage.setItem(keyForAddress(address), JSON.stringify(pruned));
    return pruned;
  }
}

export const swapPortfolioStore = new SwapPortfolioStore();
export default swapPortfolioStore;
