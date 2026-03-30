import { useEffect, useState } from "react";
import { authFetch } from "../api/authFetch";

type PendingRow = {
  id: string;
  productName?: string;
  resolvedSku?: string;
  reason: string;
  status: string;
};

export default function CicIntegrationPage() {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await authFetch("/pending");
    const data = await res.json();
    setRows(data.rows || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function resolve(id: string) {
    const sku = prompt("Inserisci SKU");
    if (!sku) return;

    await authFetch(`/pending/${id}/resolve`, {
      method: "PATCH",
      body: JSON.stringify({
        resolvedSku: sku,
        type: "RECIPE",
      }),
    });

    load();
  }

  async function reprocess(id: string) {
    await authFetch(`/pending/${id}/reprocess`, {
      method: "POST",
    });
    load();
  }

  async function reprocessAll() {
    await authFetch(`/pending/reprocess-all`, {
      method: "POST",
    });
    load();
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>⚙️ Integrazione CIC</h1>

      <button onClick={reprocessAll}>
        🔁 Riprocessa tutto
      </button>

      {loading && <p>Loading...</p>}

      {!loading && (
        <table style={{ width: "100%", marginTop: 20 }}>
          <thead>
            <tr>
              <th>Prodotto</th>
              <th>SKU</th>
              <th>Errore</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.productName}</td>
                <td>{r.resolvedSku || "-"}</td>
                <td>{r.reason}</td>
                <td>
                  <button onClick={() => resolve(r.id)}>
                    🔧 Risolvi
                  </button>
                  <button onClick={() => reprocess(r.id)}>
                    🔁 Riprocessa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
