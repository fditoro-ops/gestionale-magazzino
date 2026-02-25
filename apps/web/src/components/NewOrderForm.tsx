import { useMemo, useState } from "react";
import type { Order, OrderLine } from "./orders/orders.types";

type Supplier = "DORECA" | "ALPORI" | "VARI";
type ItemLite = { sku: string; name: string; supplier?: Supplier | null };

function normalizeSku(s: string) {
  return s.toUpperCase().trim();
}

export default function NewOrderForm({
  items,
  onCancel,
  onCreate,
}: {
  items: ItemLite[];
  onCancel: () => void;
  onCreate: (data: Pick<Order, "supplier" | "notes" | "lines">) => void;
}) {
  const [supplier, setSupplier] = useState<Supplier>("VARI");
  const [notes, setNotes] = useState<string>("");

  const [lineSku, setLineSku] = useState("");
  const [lineQty, setLineQty] = useState<string>("1");
  const [lines, setLines] = useState<OrderLine[]>([]);

  const skuOptions = useMemo(() => {
    // utile: suggerisce sku degli articoli, ma puoi inserire anche manuale
    return (items ?? [])
      .map((it) => normalizeSku(it.sku))
      .filter(Boolean)
      .sort();
  }, [items]);

  function addLine() {
    const sku = normalizeSku(lineSku);
    const qty = Number(lineQty);

    if (!sku) return;
    if (!Number.isFinite(qty) || qty <= 0) return;

    setLines((prev) => {
      const idx = prev.findIndex((x) => normalizeSku(x.sku) === sku);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qtyOrderedPz: copy[idx].qtyOrderedPz + qty };
        return copy;
      }
      return [...prev, { sku, qtyOrderedPz: qty, qtyReceivedPz: 0 }];
    });

    setLineSku("");
    setLineQty("1");
  }

  function removeLine(sku: string) {
    const key = normalizeSku(sku);
    setLines((prev) => prev.filter((l) => normalizeSku(l.sku) !== key));
  }

  function submit() {
    onCreate({
      supplier,
      notes: notes.trim() || null,
      lines,
    });
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Nuovo ordine</div>
          <div style={{ fontSize: 12, color: "#667" }}>Bozza. Aggiungi righe e salva.</div>
        </div>
        <button style={btnGhost} onClick={onCancel}>
          Chiudi
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div style={label}>Fornitore</div>
          <select value={supplier} onChange={(e) => setSupplier(e.target.value as Supplier)} style={inp}>
            <option value="DORECA">DORECA</option>
            <option value="ALPORI">ALPORI</option>
            <option value="VARI">VARI</option>
          </select>
        </div>

        <div>
          <div style={label}>Note (opzionale)</div>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} style={inp} placeholder="Es. consegna mattina" />
        </div>
      </div>

      <div style={{ borderTop: "1px solid #eef2f7", paddingTop: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Righe ordine</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 120px", gap: 10, alignItems: "end" }}>
          <div>
            <div style={label}>SKU</div>
            <input
              value={lineSku}
              onChange={(e) => setLineSku(e.target.value)}
              placeholder="Es. GIN01"
              style={inp}
              list="sku-list"
            />
            <datalist id="sku-list">
              {skuOptions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          <div>
            <div style={label}>Q.tà (PZ)</div>
            <input
              type="number"
              min={1}
              value={lineQty}
              onChange={(e) => setLineQty(e.target.value)}
              style={inp}
            />
          </div>

          <button style={btnPrimary} onClick={addLine}>
            + Aggiungi
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          {lines.length === 0 ? (
            <div style={{ color: "#667", fontSize: 13 }}>Nessuna riga.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  <th style={th}>SKU</th>
                  <th style={{ ...th, textAlign: "right" }}>Ordinato (PZ)</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.sku} style={{ borderTop: "1px solid #eef2f7" }}>
                    <td style={td}><b>{l.sku}</b></td>
                    <td style={{ ...td, textAlign: "right" }}>{l.qtyOrderedPz}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <button style={btnGhost} onClick={() => removeLine(l.sku)}>
                        Rimuovi
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button style={btnGhost} onClick={onCancel}>Annulla</button>
        <button style={btnPrimary} onClick={submit} disabled={lines.length === 0}>
          Salva bozza
        </button>
      </div>
    </div>
  );
}

const label: React.CSSProperties = { fontSize: 12, color: "#667", marginBottom: 6 };

const inp: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #d6dbe6",
  background: "white",
  outline: "none",
  fontSize: 14,
  width: "100%",
};

const btnGhost: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #d6dbe6",
  background: "white",
  cursor: "pointer",
  fontWeight: 800,
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "none",
  background: "#0B7285",
  color: "white",
  cursor: "pointer",
  fontWeight: 900,
};

const th: React.CSSProperties = {
  padding: "10px 10px",
  textAlign: "left",
  fontSize: 12,
  color: "#667",
};

const td: React.CSSProperties = { padding: "10px 10px", fontSize: 14 };
