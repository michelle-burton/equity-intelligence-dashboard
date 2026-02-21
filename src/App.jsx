
import { useMemo, useState } from "react";
import "./assets/styles.css";
import { SNAPSHOTS } from "./data/snapshots";

const TICKERS = ["HOOD", "AVGO", "NVDA"];


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

function App() {
  const [ticker, setTicker] = useState("HOOD");
  const [aiText, setAiText] = useState("");

  const history = useMemo(() => SNAPSHOTS[ticker] ?? [], [ticker]);
  const latest = history[0];
  const previous = history[1];

  return (
    <div className="page">
      <div className="container">
        <header className="header">
        <div className="branding">
            <h1 className="title">🧠 Equity Intelligence Dashboard</h1>
            <p className="subtitle">Structured market snapshots for long-term pattern analysis.</p>
        </div>

        <div className="tickerPicker">
            <label className="label">Ticker</label>
            <select
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="select"
            >
            {TICKERS.map((t) => (
                <option key={t} value={t}>{t}</option>
            ))}
            </select>
        </div>
        </header>

        <div className="grid">
          <SnapshotCard title="Latest Snapshot" snapshot={latest} />
          <SnapshotCard title="Previous Snapshot" snapshot={previous} />

          <DeltaCard latest={latest} previous={previous} />
          <HistoryCard history={history} />

          {/* ✅ ADD THIS */}
          <AiSummaryCard
            ticker={ticker}
            latest={latest}
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
        <Metric label="P/E" value={snapshot?.fundamentals?.pe ?? "—"} />
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

function HistoryCard({ history }) {
  return (
    <div className="card">
      <div className="cardTop">
        <h2 className="cardTitle">Snapshot History</h2>
        <span className="muted">{history?.length ?? 0} captures</span>
      </div>

      <div className="history">
        {(history ?? []).map((s) => (
          <div key={s.asOf} className="historyRow">
            <div>
              <div className="historyDate">{s.asOf}</div>
              <div className="muted small">Price ${s.price.toFixed(2)}</div>
            </div>
            <div className="historyChips">
              <span className="chip">1M {formatPct(s.windows.m1)}</span>
              <span className="chip">3M {formatPct(s.windows.m3)}</span>
              <span className="chip">1Y {formatPct(s.windows.y1)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <div className="metricLabel">{label}</div>
      <div className="metricValue">{value}</div>
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
        {aiText || `Click “Generate Summary” to interpret ${ticker} (${previous?.asOf ?? "—"} → ${latest?.asOf ?? "—"}).`}
      </pre>
    </div>
  );
}

export default App;