import { useState } from "react";
import { authFetch } from "../api/authFetch";

type ApiResult = any;

export default function CicAdminTools() {
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState("");

  async function runAction(label: string, url: string) {
    try {
      setLoading(label);
      setError("");
      setResult(null);

      const res = await authFetch(url, {
        method: "POST",
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Errore durante l'operazione");
      }

      setResult(json);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={styles.wrap}>
      <h2 style={styles.title}>Strumenti CIC</h2>

      <div style={styles.buttons}>
        <button
          style={styles.button}
          onClick={() => runAction("sync-products", "/admin/cic/sync-products")}
          disabled={!!loading}
        >
          Ricarica prodotti CIC
        </button>

        <button
          style={styles.button}
          onClick={() =>
            runAction("sync-product-modes", "/admin/cic/sync-product-modes")
          }
          disabled={!!loading}
        >
          Ricarica PRODOTTI_CIC
        </button>

        <button
          style={styles.button}
          onClick={() => runAction("sync-bom", "/admin/cic/sync-bom")}
          disabled={!!loading}
        >
          Ricarica BOM
        </button>

        <button
          style={{ ...styles.button, ...styles.primaryButton }}
          onClick={() =>
            runAction("reprocess-pending", "/admin/cic/reprocess-pending")
          }
          disabled={!!loading}
        >
          Rielabora pending CIC
        </button>
      </div>

      {loading && <div style={styles.info}>Operazione in corso: {loading}</div>}

      {error && <div style={styles.error}>Errore: {error}</div>}

      {result && (
        <pre style={styles.result}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    padding: 16,
    display: "grid",
    gap: 16,
  },
  title: {
    margin: 0,
  },
  buttons: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  button: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #ccc",
    cursor: "pointer",
    background: "#fff",
    fontWeight: 600,
  },
  primaryButton: {
    border: "1px solid #111",
  },
  info: {
    padding: 10,
    borderRadius: 8,
    background: "#f3f3f3",
  },
  error: {
    padding: 10,
    borderRadius: 8,
    background: "#ffe5e5",
    color: "#a40000",
  },
  result: {
    margin: 0,
    padding: 12,
    borderRadius: 10,
    background: "#111",
    color: "#eee",
    overflowX: "auto",
    fontSize: 12,
  },
};
