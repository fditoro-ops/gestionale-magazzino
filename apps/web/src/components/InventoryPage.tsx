import { useEffect, useState } from "react";

type InventorySession = {
  id: string;
  tenant_id: string;
  code: string;
  name: string | null;
  status: "DRAFT" | "COUNTING" | "CLOSED" | "APPLIED" | "CANCELLED";
  effective_at: string;
  created_at?: string;
  created_by?: string | null;
  notes?: string | null;
  applied_at?: string | null;
};

const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ||
  "https://gestionale-magazzino-8cdo.onrender.com";

export default function InventoryPage() {
  const [sessions, setSessions] = useState<InventorySession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSessions() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${API_BASE}/inventory/sessions`);
      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Errore caricamento inventari");
      }

      setSessions(data.sessions ?? []);
    } catch (err: any) {
      setError(err.message || "Errore imprevisto");
    } finally {
      setLoading(false);
    }
  }

  async function createSession() {
    try {
      const now = new Date().toISOString();

      const res = await fetch(`${API_BASE}/inventory/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Inventario manuale",
          effective_at: now,
          created_by: "core-ui",
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Errore creazione inventario");
      }

      await loadSessions();
    } catch (err: any) {
      alert(err.message);
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Inventario</h2>
          <div style={styles.subtitle}>
            Sessioni inventario create nel sistema
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button style={styles.primaryBtn} onClick={createSession}>
            + Nuovo inventario
          </button>

          <button style={styles.reloadBtn} onClick={loadSessions}>
            Ricarica
          </button>
        </div>
      </div>

      {loading && <div style={styles.info}>Caricamento inventari...</div>}
      {error && <div style={styles.error}>{error}</div>}

      {!loading && !error && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Codice</th>
                <th style={styles.th}>Nome</th>
                <th style={styles.th}>Stato</th>
                <th style={styles.th}>Data inventario</th>
                <th style={styles.th}>Creato da</th>
              </tr>
            </thead>

            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td style={styles.empty} colSpan={5}>
                    Nessuna sessione inventario trovata
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id}>
                    <td style={styles.td}>{s.code}</td>
                    <td style={styles.td}>{s.name || "-"}</td>

                    <td style={styles.td}>
                      <span style={badgeStyle(s.status)}>{s.status}</span>
                    </td>

                    <td style={styles.td}>
                      {formatDateTime(s.effective_at)}
                    </td>

                    <td style={styles.td}>{s.created_by || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("it-IT");
}

function badgeStyle(status: InventorySession["status"]): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid #ddd",
  };

  switch (status) {
    case "DRAFT":
      return { ...base, background: "#fff7d6", borderColor: "#f1d36b" };

    case "COUNTING":
      return { ...base, background: "#dff3ff", borderColor: "#86c8f2" };

    case "CLOSED":
      return { ...base, background: "#f3e8ff", borderColor: "#c7a5ff" };

    case "APPLIED":
      return { ...base, background: "#e3f7e8", borderColor: "#8ad19a" };

    case "CANCELLED":
      return { ...base, background: "#f3f3f3", borderColor: "#cfcfcf" };

    default:
      return base;
  }
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 16,
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },

  title: {
    margin: 0,
    fontSize: 24,
  },

  subtitle: {
    marginTop: 4,
    color: "#666",
    fontSize: 14,
  },

  primaryBtn: {
    border: "none",
    background: "#0B7285",
    color: "white",
    borderRadius: 10,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 700,
  },

  reloadBtn: {
    border: "1px solid #ddd",
    background: "#fff",
    borderRadius: 10,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 600,
  },

  info: {
    padding: 12,
    borderRadius: 10,
    background: "#f7f7f7",
  },

  error: {
    padding: 12,
    borderRadius: 10,
    background: "#ffe5e5",
    color: "#8a1f1f",
    border: "1px solid #f2b1b1",
  },

  tableWrap: {
    overflowX: "auto",
    border: "1px solid #e5e5e5",
    borderRadius: 14,
    background: "#fff",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
  },

  th: {
    textAlign: "left",
    padding: 12,
    borderBottom: "1px solid #ececec",
    fontSize: 13,
    color: "#555",
    background: "#fafafa",
  },

  td: {
    padding: 12,
    borderBottom: "1px solid #f2f2f2",
    fontSize: 14,
  },

  empty: {
    padding: 20,
    textAlign: "center",
    color: "#777",
  },
};
