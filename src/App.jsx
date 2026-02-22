
import { useMemo, useState } from "react";
import "./assets/styles.css";
import { SNAPSHOTS } from "./data/snapshots";
import { fetchYahooSnapshot } from "./lib/yahoo";
import { captureSnapshotWithBenchmark } from "./lib/snapshotService";

const TICKERS = ["HOOD", "AVGO", "NVDA", "SPY"];


function generateNarrative({ ticker, latest, previous }) {
  if (!latest || !previous) return "Not enough history to summarize yet.";

  const d = {
    price: latest.price - previous.price,
    w1: latest.windows.w1 - previous.windows.w1,
    m1: latest.windows.m1 - previous.windows.m1,
    m3: latest.windows.m3 - previous.windows.m3,
    m6: latest.windows.m6 - previous.windows.m6,
    y1: latest.windows.y1 - previous.windows.y1
  };

  const deltas = [
    { k: "1W", v: d.w1 },
    { k: "1M", v: d.m1 },
    { k: "3M", v: d.m3 },
    { k: "6M", v: d.m6 },
    { k: "1Y", v: d.y1 }
  ]
    .filter(x => typeof x.v === "number")
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .slice(0, 3);

  const conflict =
    (latest.windows.w1 > 0 && latest.windows.m3 < 0) ||
    (latest.windows.m1 > 0 && latest.windows.m6 < 0) ||
    (latest.windows.w1 < 0 && latest.windows.m6 > 0);

  const momentumLine = conflict
    ? "Momentum is mixed across timeframes (short-term and mid-term disagree)."
    : "Momentum is relatively aligned across timeframes (signals agree).";

  const riskNotes = [];
  const beta = latest.fundamentals?.beta;
  const pe = latest.fundamentals?.pe;

  if (typeof beta === "number" && beta >= 1.6) riskNotes.push("High volatility (beta elevated).");
  if (typeof pe === "number" && pe >= 40) riskNotes.push("Valuation is rich (P/E elevated).");

  const watch = [];
  watch.push(`Track 3M trend: ${latest.windows.m3.toFixed(1)}%`);
  watch.push(`Track 1Y context: ${latest.windows.y1.toFixed(1)}%`);
  if (typeof beta === "number") watch.push(`Volatility (beta): ${beta}`);

  const topChanges = deltas
    .map(x => `• ${x.k} shifted by ${x.v > 0 ? "+" : ""}${x.v.toFixed(1)}% since last snapshot.`)
    .join("\n");

  const priceLine = `Price moved ${d.price > 0 ? "+" : ""}$${d.price.toFixed(2)} (${ticker}).`;

  return [
    `Summary for ${ticker} (${previous.asOf} → ${latest.asOf})`,
    "",
    `Pattern Read: ${momentumLine}`,
    `Price: ${priceLine}`,
    "",
    "Top Changes:",
    topChanges || "• No major shifts detected.",
    "",
    riskNotes.length ? `Risk Notes:\n• ${riskNotes.join("\n• ")}` : "Risk Notes:\n• No major risk flags from current metrics.",
    "",
    "Watch Next Capture:",
    `• ${watch.join("\n• ")}`
  ].join("\n");
}


function formatPct(n) {
  if (typeof n !== "number") return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function deltaClass(curr, prev) {
  if (typeof curr !== "number" || typeof prev !== "number") return "";
  const d = curr - prev;
  if (d > 0.05) return "deltaUp";
  if (d < -0.05) return "deltaDown";
  return "deltaFlat";
}

const STORAGE_KEY = "eid:snapshots:v1";

function loadStoredSnapshots() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn("Failed to load snapshots from localStorage:", e);
    return {};
  }
}

function saveStoredSnapshots(all) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn("Failed to save snapshots to localStorage:", e);
  }
}

/**
 * Upsert by asOf date and keep newest-first.
 * Prevents duplicates when you capture the same day again.
 */
function upsertSnapshot(list, snap) {
  const filtered = (list ?? []).filter((s) => s?.asOf !== snap?.asOf);
  return [snap, ...filtered].sort((a, b) => (a.asOf < b.asOf ? 1 : -1));
}

/* PE functions */
function peBand(pe) {
  if (typeof pe !== "number") return "peUnknown";
  if (pe < 25) return "peGood";
  if (pe < 40) return "peElevated";
  if (pe < 70) return "peHigh";
  return "peExtreme";
}

function relBand(rel) {
  if (typeof rel !== "number") return "";
  if (rel > 1) return "relUp";
  if (rel < -1) return "relDown";
  return "relFlat";
}

function formatRel(n) {
  if (typeof n !== "number") return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}


function App() {
    //console.log(import.meta.env.VITE_FINNHUB_API_KEY);

    const [ticker, setTicker] = useState("HOOD");
    const [aiText, setAiText] = useState("");
    const [stored, setStored] = useState(() => loadStoredSnapshots());
    const [toast, setToast] = useState("");
    const [baselineAsOf, setBaselineAsOf] = useState(null);
    const [liveLatest, setLiveLatest] = useState(null);
    const [loadingLive, setLoadingLive] = useState(false);

    // 1️⃣ base data (demo)
    const baseHistory = useMemo(() => SNAPSHOTS[ticker] ?? [], [ticker]);

    // 2️⃣ stored data
    const storedHistory = stored?.[ticker] ?? [];

    // 3️⃣ merge them
    const history = useMemo(() => {
        const byDate = new Map();
        [...storedHistory, ...baseHistory].forEach((s) => {
        if (s?.asOf) byDate.set(s.asOf, s);
        });
        return [...byDate.values()].sort((a, b) =>
        a.asOf < b.asOf ? 1 : -1
        );
    }, [storedHistory, baseHistory]);

    // 4️⃣ NOW define latest & previous
    const latest = history[0];
    //const previous = history[1];
    const previous = useMemo(() => {
        if (!baselineAsOf) return history[1];
        return history.find((s) => s.asOf === baselineAsOf) ?? history[1];
        }, [baselineAsOf, history]);

    // 5️⃣ THEN define latestToShow
    const latestToShow = liveLatest ?? latest; // if you have liveLatest, otherwise just use latest
    //const latestToShow = latest;

    async function handleCapture() {
        try {
        const snap = liveLatest ?? latestToShow ?? latest;

        if (!snap?.asOf) {
            setToast("Nothing to capture yet.");
            window.setTimeout(() => setToast(""), 1600);
            return;
        }

        const nextList = upsertSnapshot(storedHistory, snap);
        const nextAll = { ...stored, [ticker]: nextList };

        setStored(nextAll);
        saveStoredSnapshots(nextAll);

        setToast(`Captured ${ticker} (${snap.asOf})`);
        window.setTimeout(() => setToast(""), 1600);

        // optional: reset baseline + AI summary so UI stays consistent
        setBaselineAsOf(null);
        setAiText("");
        } catch (e) {
        console.error("Capture failed:", e);
        alert("Capture failed. Check console.");
        }
    }

  return (
    <div className="page">
      <div className="container">
        <header className="header">
        <div className="branding">
            <h1 className="title">🧠 Equity Intelligence Dashboard</h1>
            <p className="subtitle">Structured market snapshots for long-term pattern analysis.</p>
        </div>

        <div className="controlPanel">
            <div className="controlRow">
                <div className="controlGroup">
                <label className="label">Ticker</label>
                <select
                    value={ticker}
                    onChange={(e) => {
                        setTicker(e.target.value);
                        setBaselineAsOf(null);
                        setAiText("");
                    // setSelectedPrevious?.(null); // safe if you add clickable baseline later
                    }}
                    className="select selectSmall"
                >
                    {TICKERS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                    ))}
                </select>
                </div>

                <div className="controlGroup">
                <label className="label">Actions</label>
                <div className="controlButtons">
                   <button
                        className="btn"
                        disabled={loadingLive}
                        onClick={async () => {
                            try {
                            setLoadingLive(true);

                            const snapshot = await fetchYahooSnapshot(ticker);

                            setLiveLatest(snapshot);

                            console.log("LIVE SNAPSHOT:", snapshot);
                            } catch (err) {
                            console.error("Finnhub error:", err);
                            alert("Failed to fetch live data.");
                            } finally {
                            setLoadingLive(false);
                            }
                        }}
                        >
                        {loadingLive ? "Fetching..." : "Fetch Live"}
                    </button>

                    <button
                        className="btn btnGhost"
                        onClick={() => {
                            const nextAll = { ...stored, [ticker]: [] };
                            setStored(nextAll);
                            saveStoredSnapshots(nextAll);
                            setToast(`Cleared captures for ${ticker}`);
                            window.setTimeout(() => setToast(""), 1600);
                        }}
                        >
                        Clear
                    </button>
                                  
                    <button
                        className="btn"
                        onClick={handleCapture}
                        disabled={!latestToShow && !latest}
                        >
                        Capture
                    </button>          
                                  
                    
                                  
                </div>
                </div>
            </div>

            {toast ? <div className="toast">{toast}</div> : null}
                  </div>
                  
                  {/* <button
  onClick={async () => {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${import.meta.env.VITE_FINNHUB_API_KEY}`
    );
    const data = await res.json();
    console.log("QUOTE DATA:", data);
  }}
>
  Test Finnhub Quote
                  </button> */}
                  

        </header>

        <div className="grid">
          <SnapshotCard title="Latest Snapshot" snapshot={latestToShow} />
          <SnapshotCard title="Previous Snapshot" snapshot={previous} />

          <DeltaCard latest={latestToShow} previous={previous} />
          <HistoryCard
            history={history}
            selectedAsOf={baselineAsOf}
            onSelect={(asOf) => {
                setBaselineAsOf(asOf);
                setAiText("");
            }}
            />
          <AiSummaryCard
            ticker={ticker}
            latest={latestToShow}
            previous={previous}
            aiText={aiText}
            onGenerate={() => setAiText(generateNarrative({ ticker, latest, previous }))}
            onClear={() => setAiText("")}
          />
        </div>
      </div>
    </div>
  );
}


function SnapshotCard({ title, snapshot }) {
  return (
    <div className="card">
      <div className="cardTop">
        <h2 className="cardTitle">{title}</h2>
        <span className="muted">{snapshot?.asOf ?? "—"}</span>
      </div>

      <div className="bigRow">
        <div className="bigValue">${snapshot?.price?.toFixed?.(2) ?? "—"}</div>
        <div className="pill">{snapshot ? "Snapshot" : "No data"}</div>
      </div>

      <div className="metrics">
        <Metric label="1W" value={formatPct(snapshot?.windows?.w1)} />
        <Metric label="1M" value={formatPct(snapshot?.windows?.m1)} />
        <Metric label="3M" value={formatPct(snapshot?.windows?.m3)} />
        <Metric label="6M" value={formatPct(snapshot?.windows?.m6)} />
        <Metric label="1Y" value={formatPct(snapshot?.windows?.y1)} />
      </div>

      <div className="divider" />

      <div className="metrics">
        <Metric label="Mkt Cap" value={snapshot?.fundamentals?.marketCapB ? `${snapshot.fundamentals.marketCapB}B` : "—"} />
        <Metric label="P/E" value={snapshot?.fundamentals?.pe ?? "—"} valueClassName={peBand(Number(snapshot?.fundamentals?.pe))} />
        <Metric label="Beta" value={snapshot?.fundamentals?.beta ?? "—"} />
      </div>
    </div>
  );
}

function DeltaCard({ latest, previous }) {
  const rows = [
    ["Price", latest?.price, previous?.price, (v) => `$${v.toFixed(2)}`],
    ["1W", latest?.windows?.w1, previous?.windows?.w1, formatPct],
    ["1M", latest?.windows?.m1, previous?.windows?.m1, formatPct],
    ["3M", latest?.windows?.m3, previous?.windows?.m3, formatPct],
    ["6M", latest?.windows?.m6, previous?.windows?.m6, formatPct],
    ["1Y", latest?.windows?.y1, previous?.windows?.y1, formatPct],
  ];

  return (
    <div className="card">
      <div className="cardTop">
        <h2 className="cardTitle">Delta (Latest vs Previous)</h2>
        <span className="muted">What changed?</span>
      </div>

      <div className="deltaTable">
        {rows.map(([label, curr, prev, fmt]) => {
          const currText = typeof curr === "number" ? fmt(curr) : "—";
          const prevText = typeof prev === "number" ? fmt(prev) : "—";
          const cls = deltaClass(curr, prev);

          let deltaText = "—";
          if (typeof curr === "number" && typeof prev === "number") {
            const d = curr - prev;
            const sign = d > 0 ? "+" : "";
            deltaText = label === "Price" ? `${sign}$${d.toFixed(2)}` : `${sign}${d.toFixed(1)}%`;
          }

          return (
            <div className="deltaRow" key={label}>
              <div className="deltaLabel">{label}</div>
              <div className="deltaVal">{currText}</div>
              <div className="deltaVal muted">{prevText}</div>
              <div className={`deltaVal ${cls}`}>{deltaText}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function HistoryCard({ history, selectedAsOf, onSelect }) {
  return (
    <div className="card">
      <div className="cardTop">
        <h2 className="cardTitle">Snapshot History</h2>
        <span className="muted">{history?.length ?? 0} captures</span>
      </div>

      <div className="historyCompact">
        {(history ?? []).map((s) => {
          const isSelected = s.asOf === selectedAsOf;
          const trend = s?.windows?.m3;
          const trendDir = typeof trend === "number" ? (trend >= 0 ? "up" : "down") : "flat";
          const arrow = trendDir === "up" ? "▲" : trendDir === "down" ? "▼" : "•";

          return (
            <button
              key={s.asOf}
              type="button"
              className={`historyLine ${isSelected ? "selected" : ""}`}
              onClick={() => onSelect?.(s.asOf)}
              title="Use as comparison baseline"
            >
              <div className="historyDate">{s.asOf}</div>
              <div className="historyPrice">${s.price.toFixed(2)}</div>

              <div className={`historyTrend ${trendDir}`}>
                <span className="arrow">{arrow}</span>
                <span className="labelSmall">3-mo trend</span>
                <span className="trendValue">{formatPct(trend)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* P/E change color  */
function Metric({ label, value, className = "", valueClassName = "" }) {
  return (
    <div className={`metric ${className}`}>
      <div className="metricLabel">{label}</div>
      <div className={`metricValue ${valueClassName}`}>{value}</div>
    </div>
  );
}

function AiSummaryCard({ ticker, latest, previous, aiText, onGenerate, onClear }) {
  const disabled = !latest || !previous;

  return (
    <div className="card aiCard">
      <div className="cardTop">
        <h2 className="cardTitle">AI Summary</h2>
        <span className="muted">Narrative intelligence from deltas</span>
      </div>

      <div className="aiActions">
        <button className="btn" onClick={onGenerate} disabled={disabled}>
          Generate Summary
        </button>
        <button className="btn btnGhost" onClick={onClear} disabled={!aiText}>
          Clear
        </button>
      </div>

      <pre className="aiBox">
        {aiText ||
          `Click “Generate Summary” to interpret ${ticker} (${previous?.asOf ?? "—"} → ${
            latest?.asOf ?? "—"
          }).`}
      </pre>
    </div>
  );
}

export default App;