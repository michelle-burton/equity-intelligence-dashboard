import express from "express";
import cors from "cors";
import yahooFinance from "yahoo-finance2";

// Suppress yahoo-finance2 validation notices that can interfere with requests
yahooFinance.suppressNotices(["yahooSurvey", "ripHistorical"]);

const app = express();
const PORT = process.env.PORT || 3001;

const ALLOWED_ORIGINS = [
  "https://equity-intelligence-dashboard.onrender.com",
  "http://localhost:5173",
  "http://localhost:4173",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Render health checks)
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
  if (!closes || closes.length < 6) return { w1: null, m1: null, m3: null, m6: null, y1: null };
  const last = closes[closes.length - 1];
  const at = (n) => closes[closes.length - 1 - n];
  return {
    w1: pctChange(last, at(5)),
    m1: pctChange(last, at(22)),
    m3: pctChange(last, at(66)),
    m6: pctChange(last, at(132)),
    y1: pctChange(last, at(252)),
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

async function fetchWithRetry(fn, retries = 3, delayMs = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      const is429 = err.message?.includes("Too Many Requests") || err.message?.includes("429");
      if (is429 && i < retries - 1) {
        console.log(`Yahoo 429 — retry ${i + 1}/${retries} after ${delayMs}ms`);
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      } else {
        throw err;
      }
    }
  }
}

app.get("/api/snapshot/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  try {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    // Add a small buffer so we reliably get 252 trading days
    oneYearAgo.setDate(oneYearAgo.getDate() - 30);

    const [summary, historical] = await Promise.all([
      fetchWithRetry(() =>
        yahooFinance.quoteSummary(symbol, {
          modules: ["price", "summaryDetail", "defaultKeyStatistics"],
        })
      ),
      fetchWithRetry(() =>
        yahooFinance.historical(symbol, {
          period1: oneYearAgo.toISOString().slice(0, 10),
          interval: "1d",
        })
      ),
    ]);

    const price = summary?.price?.regularMarketPrice ?? null;
    if (price === null) {
      return res.status(502).json({ error: `No price data returned for ${symbol}` });
    }

    const closes = historical.map((d) => d.close).filter((c) => typeof c === "number");
    const windows = computeWindows(closes);

    const marketCap = summary?.price?.marketCap;
    const trailingPE = summary?.summaryDetail?.trailingPE ?? null;
    const beta = summary?.summaryDetail?.beta ?? null;
    const marketCapB =
      typeof marketCap === "number"
        ? parseFloat((marketCap / 1e9).toFixed(1))
        : null;

    const snapshot = {
      asOf: new Date().toISOString().slice(0, 10),
      price: parseFloat(price.toFixed(2)),
      windows,
      fundamentals: {
        marketCapB,
        pe: typeof trailingPE === "number" ? parseFloat(trailingPE.toFixed(1)) : null,
        beta: typeof beta === "number" ? parseFloat(beta.toFixed(2)) : null,
      },
      source: "yahoo-finance2",
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
