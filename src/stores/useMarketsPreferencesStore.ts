import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type MarketSector =
  | "All"
  | "DeFi"
  | "AI"
  | "Stablecoin"
  | "Algorand"
  | "Layer1"
  | "GameFi";

export type SortBy =
  | "name"
  | "price"
  | "change24h"
  | "marketCap"
  | "volume24h"
  | "losers";

type MarketsPreferencesState = {
  sector: MarketSector;
  sortBy: SortBy;
  sortAscending: boolean;
  setSector: (sector: MarketSector) => void;
  setSort: (sortBy: SortBy, sortAscending: boolean) => void;
};

export const useMarketsPreferencesStore = create<MarketsPreferencesState>()(
  persist(
    (set) => ({
      sector: "All",
      sortBy: "marketCap",
      sortAscending: false,
      setSector: (sector) => set({ sector }),
      setSort: (sortBy, sortAscending) => set({ sortBy, sortAscending }),
    }),
    {
      name: "cresca-markets-preferences-v1",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
