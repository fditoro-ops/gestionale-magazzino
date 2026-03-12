const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3001";

export async function getMovements() {
  const res = await fetch(`${API_URL}/movements`);
  if (!res.ok) throw new Error("Errore movimenti");
  return res.json();
}

export async function getStock() {
  const res = await fetch(`${API_URL}/stock-v2`);
  if (!res.ok) throw new Error("Errore stock");
  return res.json();
}
