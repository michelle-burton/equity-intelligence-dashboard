import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3001;
const AV_KEY = process.env.ALPHA_VANTAGE_KEY;

const ALLOWED_ORIGINS = [
  "https://equity-intelligence-dashboard.onrender.com",
  "http://localhost:5173",
  "http://localhost:4173",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
  })
);

app.use(express.json());

function pctChange(current, past) {
  if (typeof current !== "number" || typeof past !== "number" || past === 0) return null;
  return parseFloat(((current / past - 1) * 100).toFixed(2));
}

function computeWindows(closes) {
  // closes = array of numbers, newest first
  if (!closes || closes.length < 6) return { w1: null, m1: null, m3: null, m6: null, y1: null };
  const last = closes[0];
  return {
    w1:  closes[5]   ? pctChange(last, closes[5])   : null,
    m1:  closes[22]  ? pctChange(last, closes[22])  : null,
    m3:  closes[66]  ? pctChange(last, closes[66])  : null,
    m6:  closes[132] ? pctChange(last, closes[132]) : null,
    y1:  closes[252] ? pctChange(last, closes[252]) : null,
  };
}

async function avFetch(params) {
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("apikey", AV_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status}`);
  return res.json();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/snapshot/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  if (!AV_KEY) {
    return res.status(500).json({ error: "ALPHA_VANTAGE_KEY not set on server" });
  }

  try {
    // Fetch quote + daily history + overview in parallel
    const [quoteData, dailyData, overviewData] = await Promise.all([
      avFetch({ function: "GLOBAL_QUOTE", symbol }),
      avFetch({ function: "TIME_SERIES_DAILY_ADJUSTED", symbol, outputsize: "full" }),
      avFetch({ function: "OVERVIEW", symbol }),
    ]);

    // --- Price ---
    const price = parseFloat(quoteData?.["Global Quote"]?.["05. price"]);
    if (!price || isNaN(price)) {
      return res.status(502).json({ error: `No price returned for ${symbol}. Alpha Vantage may be rate-limiting (25 req/day on free tier).` });
    }

    // --- Historical closes (newest first) ---
    const timeSeries = dailyData?.["Time Series (Daily)"] ?? {};
    const closes = Object.entries(timeSeries)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // newest first
      .map(([, v]) => parseFloat(v["5. adjusted close"]))
      .filter((c) => !isNaN(c));

    const windows = computeWindows(closes);

    // --- Fundamentals ---
    const marketCapRaw = parseFloat(overviewData?.MarketCapitalization);
    const peRaw = parseFloat(overviewData?.TrailingPE);
    const betaRaw = parseFloat(overviewData?.Beta);

    const snapshot = {
      asOf: new Date().toISOString().slice(0, 10),
      price,
      windows,
      fundamentals: {
        marketCapB: !isNaN(marketCapRaw) ? parseFloat((marketCapRaw / 1e9).toFixed(1)) : null,
        pe: !isNaN(peRaw) ? parseFloat(peRaw.toFixed(1)) : null,
        beta: !isNaN(betaRaw) ? parseFloat(betaRaw.toFixed(2)) : null,
      },
      source: "alpha-vantage",
    };

    res.json(snapshot);
  } catch (err) {
    console.error(`[/api/snapshot/${symbol}] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`EID API running on port ${PORT}`);
});
