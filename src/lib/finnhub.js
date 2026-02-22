const API_KEY = import.meta.env.VITE_FINNHUB_API_KEY;
const BASE = "https://finnhub.io/api/v1";

/**
 * Fetch live quote price
 */
async function fetchQuote(symbol) {
  const res = await fetch(`${BASE}/quote?symbol=${symbol}&token=${API_KEY}`);
  const data = await res.json();
  return {
    price: data?.c,
    timestamp: data?.t,
  };
}

/**
 * Fetch daily candles for window calculations
 */
async function fetchCandles(symbol, daysBack = 400) {
  const now = Math.floor(Date.now() / 1000);
  const from = now - daysBack * 86400;

  const res = await fetch(
    `${BASE}/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${now}&token=${API_KEY}`
  );

  const data = await res.json();

  if (data.s !== "ok") {
    console.warn("CANDLE ERROR:", data);
    return null;
  }

  return data;
}

/**
 * Compute percent return helper
 */
function pctChange(current, past) {
  if (typeof current !== "number" || typeof past !== "number") return null;
  if (past === 0) return null;
  return (current / past - 1) * 100;
}

/**
 * Build snapshot object
 */
export async function fetchFinnhubSnapshot(symbol) {
  if (!API_KEY) throw new Error("Missing VITE_FINNHUB_API_KEY");

  const [quote, candles] = await Promise.all([fetchQuote(symbol), fetchCandles(symbol)]);

  if (!quote?.price) {
    throw new Error("Missing quote price from Finnhub");
  }

  // If candles are blocked (403/forbidden) or return null, we still return a snapshot with just price.
  const windows = candles?.c?.length
    ? (() => {
        const closes = candles.c;
        const latestClose = closes[closes.length - 1];

        return {
          w1: pctChange(latestClose, closes[closes.length - 5]),
          m1: pctChange(latestClose, closes[closes.length - 22]),
          m3: pctChange(latestClose, closes[closes.length - 66]),
          m6: pctChange(latestClose, closes[closes.length - 132]),
          y1: pctChange(latestClose, closes[closes.length - 252]),
        };
      })()
    : { w1: null, m1: null, m3: null, m6: null, y1: null };

  return {
    asOf: new Date().toISOString().slice(0, 10),
    price: quote.price,
    windows,
    fundamentals: {},
    source: "finnhub",
  };
}