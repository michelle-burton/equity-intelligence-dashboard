// src/data/snapshots.js
export const SNAPSHOTS = {
  HOOD: [
    {
      asOf: "2026-02-14",
      price: 75.97,
      windows: { w1: -6.1, m1: -13.3, m3: -33.5, m6: -3.4, y1: 72.2 },
      fundamentals: { marketCapB: 64.1, pe: 32.4, beta: 2.44 }
    },
    {
      asOf: "2026-01-31",
      price: 79.50,
      windows: { w1: 2.1, m1: -5.8, m3: -18.4, m6: 9.2, y1: 58.0 },
      fundamentals: { marketCapB: 67.2, pe: 34.1, beta: 2.40 }
    }
  ],
  AVGO: [
    {
      asOf: "2026-02-14",
      price: 231.30,
      windows: { w1: -2.6, m1: -4.5, m3: -10.4, m6: 13.8, y1: 49.7 },
      fundamentals: { marketCapB: 1568.1, pe: 36.2, beta: 1.05 }
    },
    {
      asOf: "2026-01-31",
      price: 239.30,
      windows: { w1: 0.4, m1: 3.2, m3: -2.0, m6: 7.7, y1: 68.0 },
      fundamentals: { marketCapB: 1584.1, pe: 35.6, beta: 1.04 }
    }
  ],
  NVDA: [
    {
      asOf: "2026-02-14",
      price: 182.80,
      windows: { w1: -0.4, m1: 1.1, m3: -5.7, m6: 7.5, y1: 59.2 },
      fundamentals: { marketCapB: 4672.8, pe: 96.6, beta: 1.65 }
    },
    {
      asOf: "2026-01-31",
      price: 191.10,
      windows: { w1: 1.6, m1: 11.4, m3: -4.0, m6: 3.9, y1: 91.3 },
      fundamentals: { marketCapB: 4340.0, pe: 93.2, beta: 1.64 }
    }
    ],
  SPY: [
    {
        symbol: "SPY",
        asOf: "2026-02-14",
        price: 0,
        windows: { w1: 0, m1: 0, m3: 0, m6: 0, y1: 0 },
        fundamentals: { marketCapB: null, pe: null, beta: 1.0 },
        source: "demo"
    }
    ]
};