// Pyth Price Feed IDs (Hermes v2 — mainnet, free, no API key required)
// Full list: https://pyth.network/developers/price-feed-ids
export const PYTH_PRICE_FEEDS: Record<string, string> = {
  ALGO: '0x08f781a893bc9340140c5f89c8a96f438bcfae4d1474cc0f688e3a52892c7318',
  BTC:  '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH:  '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL:  '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  USDC: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
  USDT: '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b',
  ADA:  '0x2a01deaec9e51a579277b34b122399984d0bbf57e2458a7e42fecd2829867a0d',
  XRP:  '0xbfaf7739cb6fe3e1c57a0ac08e1d931e9e6062d476fa57804e165ab572b5b621',
  SUI:  '0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744',
  APT:  '0x03ae4db29ed4ae33d323568895aa00337e658e348b37509f5372ae51f0af00d5',
  NEAR: '0xc415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750',
  AVAX: '0x93da3352f9f1d105fdfe4971cfa80e9269ef1be1bb9c74cce8a2fca00edba89b',
  MOVE: '0x8963217838ab4cf5cadc172203c1f0b763fbaa45f346d8ee50ba994bbcac3026',
};

export interface PythPrice {
  symbol:     string;
  price:      number;
  confidence: number;
  timestamp:  number;
  expo:       number;
  isStale:    boolean;
}

interface CacheEntry {
  data:      PythPrice;
  fetchedAt: number;
}

type HermesParsedPrice = {
  id?: string;
  price: {
    price: string | number;
    conf: string | number;
    expo: number;
    publish_time: number;
  };
};

type HermesLatestResponse = {
  parsed?: HermesParsedPrice[];
};

const COINGECKO_SYMBOL_IDS: Record<string, string> = {
  ALGO: 'algorand',
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  USDC: 'usd-coin',
  USDT: 'tether',
  ADA: 'cardano',
  XRP: 'ripple',
  SUI: 'sui',
  APT: 'aptos',
  NEAR: 'near',
  AVAX: 'avalanche-2',
  MOVE: 'movement',
};

// These ids currently return "Price ids not found" on Hermes latest endpoint.
const FORCE_FALLBACK_SYMBOLS = new Set<string>(['ALGO', 'XRP', 'AVAX']);

class PythOracleService {
  private readonly baseUrl = 'https://hermes.pyth.network';
  private cache: Record<string, CacheEntry> = {};
  private readonly cacheMs     = 10_000;  // 10 s — Pyth updates ~400 ms
  private readonly staleLimitMs = 60_000; // 60 s
  private readonly fallbackCooldownMs = 120_000; // 2 minutes on 429
  private coinGeckoRateLimitedUntil = 0;
  private notFoundWarned = new Set<string>();

  private getCachedFallbackPrices(symbols: string[]): Record<string, number> {
    const out: Record<string, number> = {};
    symbols.forEach((symbol) => {
      const cached = this.cache[symbol]?.data;
      if (cached && Number.isFinite(cached.price) && cached.price > 0) {
        out[symbol] = cached.price;
      }
    });
    return out;
  }

  private async fetchLatest(ids: string[]): Promise<HermesParsedPrice[]> {
    if (ids.length === 0) return [];

    const qs = ids.map((id) => `ids[]=${encodeURIComponent(id)}`).join('&');
    const url = `${this.baseUrl}/v2/updates/price/latest?${qs}&parsed=true`;

    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => String(res.status));
      // Hermes can return 404 when one or more ids are unknown on this endpoint.
      // Treat as empty data to avoid crashing runtime flows in Expo Go.
      if (res.status === 404 || text.toLowerCase().includes('price ids not found')) {
        const warnKey = ids.join(',');
        if (!this.notFoundWarned.has(warnKey)) {
          this.notFoundWarned.add(warnKey);
          console.warn(`⚠️ Hermes missing feed(s): ${text}`);
        }
        return [];
      }
      throw new Error(`Hermes API error ${res.status}: ${text}`);
    }

    const data = await res.json() as HermesLatestResponse;
    return data.parsed ?? [];
  }

  private toPythPrice(symbol: string, parsed: HermesParsedPrice): PythPrice {
    const priceValue = Number(parsed.price.price) * Math.pow(10, parsed.price.expo);
    const confValue  = Number(parsed.price.conf)  * Math.pow(10, parsed.price.expo);
    const publishMs  = parsed.price.publish_time * 1000;
    const age        = Date.now() - publishMs;

    return {
      symbol,
      price: priceValue,
      confidence: confValue,
      timestamp: publishMs,
      expo: parsed.price.expo,
      isStale: age > this.staleLimitMs,
    };
  }

  private async fetchCoinGeckoPrices(symbols: string[]): Promise<Record<string, number>> {
    const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
    const now = Date.now();
    if (now < this.coinGeckoRateLimitedUntil) {
      return this.getCachedFallbackPrices(unique);
    }

    const ids = unique
      .map((s) => COINGECKO_SYMBOL_IDS[s])
      .filter((id): id is string => Boolean(id));

    if (ids.length === 0) return {};

    const url =
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=usd`;

    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => String(res.status));
      if (res.status === 429) {
        this.coinGeckoRateLimitedUntil = Date.now() + this.fallbackCooldownMs;
        const cached = this.getCachedFallbackPrices(unique);
        if (Object.keys(cached).length > 0) {
          console.warn('⚠️ CoinGecko rate-limited, using cached fallback prices');
          return cached;
        }
      }
      throw new Error(`CoinGecko API error ${res.status}: ${text}`);
    }

    const data = await res.json() as Record<string, { usd?: number }>;
    const out: Record<string, number> = {};

    unique.forEach((symbol) => {
      const id = COINGECKO_SYMBOL_IDS[symbol];
      const usd = id ? Number(data?.[id]?.usd) : NaN;
      if (Number.isFinite(usd) && usd > 0) out[symbol] = usd;
    });

    return out;
  }

  private fromFallback(symbol: string, priceUsd: number): PythPrice {
    return {
      symbol,
      price: priceUsd,
      confidence: 0,
      timestamp: Date.now(),
      expo: -2,
      isStale: false,
    };
  }

  /**
   * Get the latest price for a single symbol.
   * Returns null if the feed is not configured or the request fails.
   */
  async getPrice(symbol: string): Promise<PythPrice | null> {
    const key = symbol.toUpperCase();
    const cached = this.cache[key];
    if (cached && Date.now() - cached.fetchedAt < this.cacheMs) {
      console.log(`💰 Cache hit for ${key}: $${cached.data.price.toFixed(2)}`);
      return cached.data;
    }

    if (FORCE_FALLBACK_SYMBOLS.has(key)) {
      try {
        const fallback = await this.fetchCoinGeckoPrices([key]);
        const price = fallback[key];
        if (price) {
          const pythLike = this.fromFallback(key, price);
          this.cache[key] = { data: pythLike, fetchedAt: Date.now() };
          console.log(`✅ Fallback price for ${key}: $${price.toFixed(2)} (CoinGecko)`);
          return pythLike;
        }
      } catch (err) {
        console.warn(`⚠️ Fallback price fetch failed for ${key}:`, err);
      }

      // Do not call Hermes for these symbols; their feeds are known-missing.
      return cached?.data ?? null;
    }

    const priceId = PYTH_PRICE_FEEDS[key];
    if (!priceId) {
      console.warn(`⚠️ No Pyth price feed configured for ${symbol}`);
      return null;
    }

    try {
      const parsed = (await this.fetchLatest([priceId]))[0];
      if (!parsed) {
        // Fallback path when Hermes id is stale/missing.
        try {
          const fallback = await this.fetchCoinGeckoPrices([key]);
          const price = fallback[key];
          if (price) {
            const pythLike = this.fromFallback(key, price);
            this.cache[key] = { data: pythLike, fetchedAt: Date.now() };
            console.log(`✅ Fallback price for ${key}: $${price.toFixed(2)} (CoinGecko)`);
            return pythLike;
          }
        } catch (err) {
          console.warn(`⚠️ Fallback price fetch failed for ${key}:`, err);
        }
        console.warn(`⚠️ No parsed price returned for ${symbol}`);
        return cached?.data ?? null;
      }

      const pythPrice = this.toPythPrice(symbol, parsed);

      this.cache[key] = { data: pythPrice, fetchedAt: Date.now() };

      console.log(
        `✅ Pyth price for ${symbol}: $${pythPrice.price.toFixed(2)} (±$${pythPrice.confidence.toFixed(2)})${pythPrice.isStale ? ' ⚠️ STALE' : ''}`,
      );
      return pythPrice;
    } catch (err) {
      console.warn(`⚠️ Failed to fetch Pyth price for ${symbol}:`, err);
      return cached?.data ?? null;
    }
  }

  /**
   * Batch-fetch prices for multiple symbols in a single Hermes request.
   */
  async getPrices(symbols: string[]): Promise<Record<string, PythPrice>> {
    const norm = symbols.map((s) => s.toUpperCase());
    const pythSymbols = norm.filter((s) => !FORCE_FALLBACK_SYMBOLS.has(s));
    const ids = pythSymbols.map((s) => PYTH_PRICE_FEEDS[s]).filter(Boolean);
    const result: Record<string, PythPrice> = {};

    if (ids.length > 0) {
      try {
        const parsedPrices = await this.fetchLatest(ids);
        const byId = new Map(parsedPrices.map((p) => [String(p.id ?? '').toLowerCase(), p]));

        pythSymbols.forEach((symbol, i) => {
          const id = String(ids[i] ?? '').toLowerCase();
          const parsed = byId.get(id) ?? parsedPrices[i];
          if (!symbol) return;
          if (!parsed) return;

          const pythPrice = this.toPythPrice(symbol, parsed);

          result[symbol] = pythPrice;
          this.cache[symbol] = { data: pythPrice, fetchedAt: Date.now() };
        });
      } catch (err) {
        console.warn('⚠️ Failed to fetch Pyth prices:', err);
      }
    }

    const missing = norm.filter((s) => !result[s]);
    if (missing.length > 0) {
      try {
        const fallbackMap = await this.fetchCoinGeckoPrices(missing);
        missing.forEach((symbol) => {
          const usd = fallbackMap[symbol];
          if (!usd) return;
          const fallback = this.fromFallback(symbol, usd);
          result[symbol] = fallback;
          this.cache[symbol] = { data: fallback, fetchedAt: Date.now() };
        });
      } catch (err) {
        console.warn('⚠️ Failed to fetch fallback prices:', err);
      }
    }

    console.log(`✅ Fetched ${Object.keys(result).length} prices (Pyth + fallback)`);
    return result;
  }

  /**
   * Convenience: fetch BTC/ETH/SOL bundle prices.
   */
  async getBundlePrices() {
    const prices = await this.getPrices(['BTC', 'ETH', 'SOL']);
    if (!prices.BTC || !prices.ETH || !prices.SOL) {
      throw new Error('Failed to fetch bundle prices from Pyth');
    }
    const bundleValue = prices.BTC.price * 0.5 + prices.ETH.price * 0.3 + prices.SOL.price * 0.2;
    return {
      btc: { symbol: 'BTC', price: prices.BTC.price, change24h: 0, lastUpdated: prices.BTC.timestamp, confidence: prices.BTC.confidence, isStale: prices.BTC.isStale },
      eth: { symbol: 'ETH', price: prices.ETH.price, change24h: 0, lastUpdated: prices.ETH.timestamp, confidence: prices.ETH.confidence, isStale: prices.ETH.isStale },
      sol: { symbol: 'SOL', price: prices.SOL.price, change24h: 0, lastUpdated: prices.SOL.timestamp, confidence: prices.SOL.confidence, isStale: prices.SOL.isStale },
      bundleValue,
      timestamp: Date.now(),
    };
  }

  clearCache() {
    this.cache = {};
    console.log('🗑️ Pyth price cache cleared');
  }

  isPriceStale(price: PythPrice): boolean {
    return Date.now() - price.timestamp > this.staleLimitMs;
  }
}

export const pythOracleService = new PythOracleService();
export default pythOracleService;
