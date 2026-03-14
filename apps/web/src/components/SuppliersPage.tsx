import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type Supplier = {
  id: string;
  code: string;
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  vat_number?: string | null;
  created_at?: string;
};

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [vatNumber, setVatNumber] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);

  async function loadSuppliers() {
    setLoading(true);
    setErr(null);

    try {
      const r = await fetch(`${API_BASE}/suppliers`);
      const data = await r.json();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch {
      setErr("Errore caricamento fornitori");
      setSuppliers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSuppliers();
  }, []);

  function resetForm() {
    setCode("");
    setName("");
    setContactName("");
    setPhone("");
    setVatNumber("");
    setEditingId(null);
  }

  async function saveSupplier() {
    setErr(null);

    if (!code.trim() || !name.trim()) {
      setErr("Codice e nome fornitore sono obbligatori");
      return;
    }

    const payload = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      contactName: contactName.trim(),
      phone: phone.trim(),
      vatNumber: vatNumber.trim(),
    };

    setLoading(true);

    try {
      const url = editingId
        ? `${API_BASE}/suppliers/${editingId}`
        : `${API_BASE}/suppliers`;

      const method = editingId ? "PATCH" : "POST";

      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => null);

      if (!r.ok) {
        throw new Error(j?.error || "Errore salvataggio fornitore");
      }

      resetForm();
      await loadSuppliers();
    } catch (e: any) {
      setErr(e?.message || "Errore salvataggio fornitore");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(s: Supplier) {
    setEditingId(s.id);
    setCode(s.code || "");
    setName(s.name || "");
    setContactName(s.contact_name || "");
    setPhone(s.phone || "");
    setVatNumber(s.vat_number || "");
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={card}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Fornitori</h2>
        <div style={{ fontSize: 12, color: "#667" }}>
          Anagrafica minima fornitori per ordini, WhatsApp e fatture passive
        </div>
      </div>

      {err && <div style={{ color: "red" }}>{err}</div>}

      <div style={card}>
        <strong>{editingId ? `Modifica ${editingId}` : "Nuovo fornitore"}</strong>

        <div style={grid}>
          <input
            placeholder="Codice fornitore (es. DORECA)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={inp}
            disabled={!!editingId}
          />

          <input
            placeholder="Nome fornitore"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inp}
          />

          <input
            placeholder="Referente"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            style={inp}
          />

          <input
            placeholder="Telefono / WhatsApp"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={inp}
          />

          <input
            placeholder="Partita IVA"
            value={vatNumber}
            onChange={(e) => setVatNumber(e.target.value)}
            style={inp}
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={saveSupplier} disabled={loading} style={btnPrimary}>
            {editingId ? "Salva modifiche" : "Crea fornitore"}
          </button>

          <button onClick={resetForm} disabled={loading} style={btnGhost}>
            Reset
          </button>
        </div>
      </div>

      <div style={card}>
        <strong>Elenco fornitori</strong>

        <div style={{ marginTop: 10, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <Th>ID</Th>
                <Th>Codice</Th>
                <Th>Nome</Th>
                <Th>Referente</Th>
                <Th>Telefono</Th>
                <Th>P. IVA</Th>
                <Th style={{ textAlign: "right" }}>Azioni</Th>
              </tr>
            </thead>

            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid #eef2f7" }}>
                  <Td>{s.id}</Td>
                  <Td>{s.code}</Td>
                  <Td>{s.name}</Td>
                  <Td>{s.contact_name || "—"}</Td>
                  <Td>{s.phone || "—"}</Td>
                  <Td>{s.vat_number || "—"}</Td>
                  <Td style={{ textAlign: "right" }}>
                    <button onClick={() => startEdit(s)} style={btnGhost}>
                      Modifica
                    </button>
                  </Td>
                </tr>
              ))}

              {!loading && suppliers.length === 0 && (
                <tr>
                  <Td colSpan={7} style={{ color: "#667" }}>
                    Nessun fornitore presente.
                  </Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <th
      style={{
        padding: "10px 12px",
        textAlign: "left",
        fontSize: 12,
        color: "#667",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  style,
  colSpan,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        padding: "10px 12px",
        fontSize: 14,
        ...style,
      }}
    >
      {children}
    </td>
  );
}

const card: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 14,
};

const grid: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const inp: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #d6dbe6",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #0B7285",
  background: "#0B7285",
  color: "white",
  cursor: "pointer",
  fontWeight: 900,
};

const btnGhost: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #d6dbe6",
  background: "white",
  cursor: "pointer",
  fontWeight: 900,
};
