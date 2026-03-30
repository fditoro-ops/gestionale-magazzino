import { useEffect, useMemo, useState } from "react";
import { authFetch } from "../api/authFetch";

type PendingRow = {
  id: string;
  productName?: string;
  resolvedSku?: string;
  reason: string;
  status: string;
  qty?: number;
  total?: number;
  price?: number;
  orderDate?: string;
  receiptNumber?: string;
};

export default function CicIntegrationPage() {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [errorFilter, setErrorFilter] = useState("ALL");

  async function load() {
    setLoading(true);

    const [pendingRes, itemsRes] = await Promise.all([
      authFetch("/pending"),
      authFetch("/items"),
    ]);

    const pendingData = await pendingRes.json();
    const itemsData = await itemsRes.json();

    setRows(pendingData.rows || []);
    setItems(itemsData || []);

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (errorFilter !== "ALL" && r.reason !== errorFilter) return false;

      if (filter) {
        const text = `${r.productName} ${r.receiptNumber}`
          .toLowerCase();
        return text.includes(filter.toLowerCase());
      }

      return true;
    });
  }, [rows, filter, errorFilter]);

  async function resolve(id: string, sku: string) {
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

      {/* CONTROLLI */}
      <div style={{ display: "flex", gap: 10, marginBottom: 15 }}>
        <input
          placeholder="Cerca prodotto / scontrino..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        <select
          value={errorFilter}
          onChange={(e) => setErrorFilter(e.target.value)}
        >
          <option value="ALL">Tutti</option>
          <option value="UNMAPPED_PRODUCT">Unmapped</option>
          <option value="UNCLASSIFIED_SKU">Unclassified</option>
        </select>

        <button onClick={reprocessAll}>
          🔁 Riprocessa tutto
        </button>
      </div>

      {loading && <p>Loading...</p>}

      {!loading && (
        <table style={{ width: "100%", fontSize: 13 }}>
          <thead>
            <tr>
              <th>Data</th>
              <th>Scontrino</th>
              <th>Prodotto</th>
              <th>Qta</th>
              <th>Importo</th>
              <th>SKU</th>
              <th>Errore</th>
              <th>Azioni</th>
            </tr>
          </thead>

          <tbody>
            {filteredRows.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.orderDate
                    ? new Date(r.orderDate).toLocaleString()
                    : "-"}
                </td>

                <td>{r.receiptNumber || "-"}</td>

                <td>{r.productName || "-"}</td>

                <td>{r.qty || "-"}</td>

                <td>{r.total || r.price || "-"}</td>

                {/* SELECT SKU */}
                <td>
                  <select
                    defaultValue={r.resolvedSku || ""}
                    onChange={(e) =>
                      resolve(r.id, e.target.value)
                    }
                  >
                    <option value="">-- scegli SKU --</option>
                    {items.map((it) => (
                      <option key={it.sku} value={it.sku}>
                        {it.sku} - {it.name}
                      </option>
                    ))}
                  </select>
                </td>

                {/* ERRORE COLORATO */}
                <td
                  style={{
                    color:
                      r.reason === "UNMAPPED_PRODUCT"
                        ? "red"
                        : "orange",
                    fontWeight: 700,
                  }}
                >
                  {r.reason}
                </td>

                <td>
                  <button onClick={() => reprocess(r.id)}>
                    🔁
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
