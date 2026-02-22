import { fetchYahooSnapshot } from "./yahoo";

// Computes stock-vs-benchmark and returns ONE snapshot object with everything baked in.
export async function captureSnapshotWithBenchmark({
  symbol,
  benchmarkSymbol = "SPY",
}) {
  // 1) fetch both snapshots in parallel
  const [stockSnap, benchSnap] = await Promise.all([
    fetchYahooSnapshot(symbol),
    fetchYahooSnapshot(benchmarkSymbol),
  ]);

  // 2) compute relative
  const stockY1 = stockSnap?.windows?.y1;
  const benchY1 = benchSnap?.windows?.y1;

  const relY1 =
    typeof stockY1 === "number" && typeof benchY1 === "number"
      ? stockY1 - benchY1
      : null;

  // 3) return ONE unified snapshot
  return {
    ...stockSnap,
    symbol,
    benchmark: {
      symbol: benchmarkSymbol,
      windows: {
        y1: benchY1 ?? null,
      },
    },
    relative: {
      vsBenchmark: {
        y1: relY1,
      },
    },
  };
}