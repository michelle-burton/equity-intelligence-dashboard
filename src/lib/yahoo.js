const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export async function fetchYahooSnapshot(symbol) {
  const res = await fetch(`${API_URL}/api/snapshot/${symbol}`);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `API error ${res.status} for ${symbol}`);
  }

  return res.json();
}
