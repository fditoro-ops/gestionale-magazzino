import { useMemo, useState } from "react";

/* ---------------- TYPES (copiati da ItemsAdmin) ---------------- */

export type StockKind = "UNIT" | "VOLUME_CONTAINER";
export type Supplier = "DORECA" | "ALPORI" | "VARI";

export type Item = {
  itemId: string;
  sku: string;
  name: string;
  categoryId: string;
  active: boolean;

  stockKind: StockKind;
  baseUnit: "CL";

  unitToCl: number | null;
  containerSizeCl: number | null;
  containerLabel: string | null;

  minStockCl: number;

  brand: string | null;
  packSize: number | null;

  supplier: Supplier;

  imageUrl: string | null;
  lastCostCents: number | null;
  costCurrency: string;
};

const CATEGORIES = [
  { id: "bevande", label: "BEVANDE" },
  { id: "vino", label: "VINO" },
  { id: "birra", label: "BIRRA" },
  { id: "amari", label: "AMARI" },
  { id: "distillati_altri", label: "ALTRI DISTILLATI" },
  { id: "gin", label: "GIN" },
  { id: "vodka", label: "VODKA" },
  { id: "whiskey", label: "WHISKEY" },
  { id: "rhum", label: "RHUM" },
  { id: "tequila", label: "TEQUILA" },
] as const;

const SUPPLIERS = [
  { id: "DORECA", label: "DORECA" },
  { id: "ALPORI", label: "ALPORI" },
  { id: "VARI", label: "VARI" },
] as const;

const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as readonly string[];

function normalizeCategoryId(raw: any): (typeof CATEGORIES)[number]["id"] {
  const s = (raw ?? "").toString();
  return (CATEGORY_IDS as readonly string[]).includes(s) ? (s as any) : "bevande";
}

function centsToEuroString(cents: number | null | undefined) {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

/* ---------------- PROPS ---------------- */

export default function ItemDetailsModal({
  open,
  item,
  onClose,
  onSavePatch,
  loading,
}: {
  open: boolean;
  item: Item | null;
  onClose: () => void;
  onSavePatch: (sku: string, patch: any) => Promise<void>;
  loading: boolean;
}) {
  const [editMode, setEditMode] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // draft solo per i campi editabili
  const [draft, setDraft] = useState<{
    name: string;
    categoryId: string;
    supplier: Supplier;
    active: boolean;
    minStockCl: number;

    // opzionali (se vuoi abilitarli dopo)
    stockKind?: StockKind;
    unitToCl?: number | null;
    containerSizeCl?: number | null;
    containerLabel?: string | null;
    packSize?: number | null;
    brand?: string | null;
  }>({
    name: "",
    categoryId: "bevande",
    supplier: "VARI",
    active: true,
    minStockCl: 0,
  });

  // quando cambia item, resettiamo modalità e draft
  useMemo(() => {
    if (!item) return;
    setEditMode(false);
    setErr(null);
    setDraft({
      name: item.name ?? "",
      categoryId: normalizeCategoryId(item.categoryId),
      supplier: (item.supplier ?? "VARI") as Supplier,
      active: !!item.active,
      minStockCl: Number(item.minStockCl ?? 0),

      // (non editabili per ora, ma li teniamo pronti)
      stockKind: item.stockKind,
      unitToCl: item.unitToCl ?? null,
      containerSizeCl: item.containerSizeCl ?? null,
      containerLabel: item.containerLabel ?? null,
      packSize: item.packSize ?? null,
      brand: item.brand ?? null,
    });
  }, [item?.sku]); // eslint-disable-line react-hooks/exhaustive-deps

  const categoryLabel = useMemo(() => {
    if (!item) return "";
    return CATEGORIES.find((c) => c.id === item.categoryId)?.label ?? item.categoryId;
  }, [item]);

  if (!open || !item) return null;

  async function handleSave() {
    setErr(null);

    // ✅ whitelist campi consentiti
    const patch: any = {
      name: draft.name.trim(),
      categoryId: normalizeCategoryId(draft.categoryId),
      supplier: draft.supplier,
      active: !!draft.active,
      minStockCl: Number(draft.minStockCl) || 0,
    };

    if (!patch.name) {
      setErr("Il nome è obbligatorio");
      return;
    }

    try {
      if (!item) return;
      await onSavePatch(item.sku, patch);
      setEditMode(false);
    } catch (e: any) {
      setErr(e?.message || "Errore salvataggio");
    }
  }

  return (
    <div style={backdrop} onMouseDown={onClose}>
      <div style={modal} onMouseDown={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={header}>
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>
              {item.sku} · {item.name}
            </div>
            <div style={{ fontSize: 12, color: "#667" }}>
              {categoryLabel} · {item.supplier} · {item.active ? "ATTIVO" : "NON ATTIVO"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!editMode ? (
              <button style={btnPrimary} onClick={() => setEditMode(true)}>
                Modifica
              </button>
            ) : (
              <>
                <button style={btnPrimary} onClick={handleSave} disabled={loading}>
                  Salva
                </button>
                <button
                  style={btnGhost}
                  onClick={() => {
                    // reset draft a valori item
                    setEditMode(false);
                    setErr(null);
                    setDraft({
                      name: item.name ?? "",
                      categoryId: normalizeCategoryId(item.categoryId),
                      supplier: (item.supplier ?? "VARI") as Supplier,
                      active: !!item.active,
                      minStockCl: Number(item.minStockCl ?? 0),

                      stockKind: item.stockKind,
                      unitToCl: item.unitToCl ?? null,
                      containerSizeCl: item.containerSizeCl ?? null,
                      containerLabel: item.containerLabel ?? null,
                      packSize: item.packSize ?? null,
                      brand: item.brand ?? null,
                    });
                  }}
                  disabled={loading}
                >
                  Annulla
                </button>
              </>
            )}

            <button style={btnGhost} onClick={onClose} disabled={loading}>
              Chiudi
            </button>
          </div>
        </div>

        {err && <div style={{ color: "#b42318", fontWeight: 700 }}>{err}</div>}

        {/* Contenuto */}
        <div style={{ display: "grid", gap: 14 }}>
          {/* SEZIONE: campi editabili (solo in editMode) */}
          <div style={section}>
            <div style={sectionTitle}>Campi gestibili</div>

            <div style={grid2}>
              <label style={field}>
                <div style={label}>Nome</div>
                <input
                  style={inp}
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  disabled={!editMode || loading}
                />
              </label>

              <label style={field}>
                <div style={label}>Categoria</div>
                <select
                  style={inp}
                  value={draft.categoryId}
                  onChange={(e) => setDraft((d) => ({ ...d, categoryId: e.target.value }))}
                  disabled={!editMode || loading}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={field}>
                <div style={label}>Fornitore</div>
                <select
                  style={inp}
                  value={draft.supplier}
                  onChange={(e) => setDraft((d) => ({ ...d, supplier: e.target.value as Supplier }))}
                  disabled={!editMode || loading}
                >
                  {SUPPLIERS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={field}>
                <div style={label}>Attivo</div>
                <select
                  style={inp}
                  value={draft.active ? "SI" : "NO"}
                  onChange={(e) => setDraft((d) => ({ ...d, active: e.target.value === "SI" }))}
                  disabled={!editMode || loading}
                >
                  <option value="SI">SI</option>
                  <option value="NO">NO</option>
                </select>
              </label>

              <label style={field}>
                <div style={label}>Scorta minima (CL)</div>
                <input
                  style={inp}
                  type="number"
                  value={draft.minStockCl}
                  onChange={(e) => setDraft((d) => ({ ...d, minStockCl: Number(e.target.value) }))}
                  disabled={!editMode || loading}
                />
              </label>
            </div>

            <div style={{ fontSize: 12, color: "#667" }}>
              Nota: qui abilitiamo solo i campi concordati. Tutto il resto è read-only.
            </div>
          </div>

          {/* SEZIONE: dettaglio completo (sempre) */}
          <div style={section}>
            <div style={sectionTitle}>Dettaglio completo</div>

            <div style={grid3}>
              <Kv k="SKU" v={item.sku} />
              <Kv k="ItemId" v={item.itemId} />
              <Kv k="Nome" v={item.name} />
              <Kv k="Categoria" v={categoryLabel} />
              <Kv k="Fornitore" v={item.supplier} />
              <Kv k="Attivo" v={item.active ? "SI" : "NO"} />

              <Kv k="StockKind" v={item.stockKind} />
              <Kv k="BaseUnit" v={item.baseUnit} />
              <Kv k="unitToCl" v={item.unitToCl ?? "—"} />
              <Kv k="containerSizeCl" v={item.containerSizeCl ?? "—"} />
              <Kv k="containerLabel" v={item.containerLabel ?? "—"} />

              <Kv k="minStockCl" v={item.minStockCl ?? 0} />

              <Kv k="brand" v={item.brand ?? "—"} />
              <Kv k="packSize" v={item.packSize ?? "—"} />

              <Kv k="lastCost" v={centsToEuroString(item.lastCostCents) || "—"} />
              <Kv k="currency" v={item.costCurrency || "EUR"} />

              <Kv k="imageUrl" v={item.imageUrl ?? "—"} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- SMALL COMPONENTS ---------------- */

function Kv({ k, v }: { k: string; v: any }) {
  return (
    <div style={kv}>
      <div style={kvKey}>{k}</div>
      <div style={kvVal}>{String(v)}</div>
    </div>
  );
}

/* ---------------- STYLES ---------------- */

const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(10, 20, 40, 0.45)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: 18,
  zIndex: 9999,
};

const modal: React.CSSProperties = {
  width: "min(980px, 98vw)",
  maxHeight: "92vh",
  overflow: "auto",
  background: "white",
  borderRadius: 16,
  border: "1px solid #e5e7eb",
  boxShadow: "0 10px 30px rgba(0,0,0,.20)",
  padding: 14,
  display: "grid",
  gap: 14,
};

const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  borderBottom: "1px solid #eef2f7",
  paddingBottom: 12,
};

const section: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 10,
};

const sectionTitle: React.CSSProperties = {
  fontWeight: 900,
  color: "#0b1c3d",
};

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const grid3: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const field: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const label: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#667",
};

const inp: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #d6dbe6",
  fontSize: 14,
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #0B7285",
  background: "#0B7285",
  color: "white",
  cursor: "pointer",
  fontWeight: 900,
  width: "fit-content",
};

const btnGhost: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #d6dbe6",
  background: "white",
  cursor: "pointer",
  fontWeight: 900,
  width: "fit-content",
};

const kv: React.CSSProperties = {
  border: "1px solid #eef2f7",
  borderRadius: 12,
  padding: 10,
  display: "grid",
  gap: 6,
};

const kvKey: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#667",
};

const kvVal: React.CSSProperties = {
  fontSize: 13,
  color: "#0b1c3d",
  wordBreak: "break-word",
};
