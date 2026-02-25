import { useEffect, useMemo, useState } from "react";
import ItemDetailsModal, { type Item } from "./ItemDetailsModal";

type StockKind = "UNIT" | "VOLUME_CONTAINER";
type Supplier = "DORECA" | "ALPORI" | "VARI";

const API = "http://localhost:3001";

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

const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as readonly string[];

function normalizeCategoryId(raw: any): (typeof CATEGORIES)[number]["id"] {
  const s = (raw ?? "").toString();
  return (CATEGORY_IDS as readonly string[]).includes(s) ? (s as any) : "bevande";
}

const SUPPLIERS = [
  { id: "DORECA", label: "DORECA" },
  { id: "ALPORI", label: "ALPORI" },
  { id: "VARI", label: "VARI" },
] as const;

function euroToCents(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function normalizeSku(s: string) {
  return s.toUpperCase().trim();
}

function isHttpUrl(s: string) {
  if (!s.trim()) return true;
  return /^https?:\/\/.+/i.test(s);
}

export default function ItemsAdmin() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  // CREATE
  const [newSku, setNewSku] = useState("");
  const [newName, setNewName] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newPackSize, setNewPackSize] = useState("");

  const [newCategoryId, setNewCategoryId] = useState<
    (typeof CATEGORIES)[number]["id"]
  >("bevande");

  const [newSupplier, setNewSupplier] = useState<Supplier>("VARI");

  const [newStockKind, setNewStockKind] = useState<StockKind>("UNIT");
  const [newUnitToCl, setNewUnitToCl] = useState(33);
  const [newContainerSizeCl, setNewContainerSizeCl] = useState(70);
  const [newContainerLabel, setNewContainerLabel] = useState("Bottiglia");
  const [newMinStockCl, setNewMinStockCl] = useState(0);
  const [newLastCostEuro, setNewLastCostEuro] = useState("");
  const [newImageUrl, setNewImageUrl] = useState("");

  // DETAILS MODAL
  const [selected, setSelected] = useState<Item | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  function openDetails(it: Item) {
    setSelected(it);
    setDetailsOpen(true);
  }

  function closeDetails() {
    setDetailsOpen(false);
    setSelected(null);
  }

  async function reload() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${API}/items`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setErr("Errore caricamento articoli");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toUpperCase();
    if (!qq) return items;
    return items.filter((i) => {
      const sku = (i.sku ?? "").toUpperCase();
      const name = (i.name ?? "").toUpperCase();
      return sku.includes(qq) || name.includes(qq);
    });
  }, [items, q]);

  async function createItem() {
    setErr(null);

    const sku = normalizeSku(newSku);
    if (!sku || !newName.trim()) {
      setErr("SKU e nome obbligatori");
      return;
    }

    if (!isHttpUrl(newImageUrl)) {
      setErr("URL immagine non valido");
      return;
    }

    const payload: any = {
      sku,
      name: newName.trim(),
      categoryId: newCategoryId,
      supplier: newSupplier,
      active: true,
      stockKind: newStockKind,
      baseUnit: "CL",
      minStockCl: newMinStockCl,
      brand: newBrand.trim() || null,
      packSize: newPackSize.trim() ? Number(newPackSize) : null,
      lastCostCents: euroToCents(newLastCostEuro),
      costCurrency: "EUR",
      imageUrl: newImageUrl.trim() || null,
    };

    if (newStockKind === "UNIT") {
      payload.unitToCl = newUnitToCl;
    } else {
      payload.containerSizeCl = newContainerSizeCl;
      payload.containerLabel = newContainerLabel;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        console.log("CREATE ERROR", data);
        throw new Error(data?.error || "Errore creazione articolo");
      }

      await reload();

      // reset
      setNewSku("");
      setNewName("");
      setNewBrand("");
      setNewPackSize("");
      setNewCategoryId("bevande");
      setNewSupplier("VARI");
      setNewStockKind("UNIT");
      setNewUnitToCl(33);
      setNewContainerSizeCl(70);
      setNewContainerLabel("Bottiglia");
      setNewMinStockCl(0);
      setNewLastCostEuro("");
      setNewImageUrl("");
    } catch (e: any) {
      setErr(e?.message ?? "Errore creazione articolo");
    } finally {
      setLoading(false);
    }
  }

  // chiamata dal modal: PATCH + reload + aggiorna selected
  async function savePatch(sku: string, patch: any) {
    const res = await fetch(`${API}/items/${encodeURIComponent(sku)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Errore salvataggio");
    }

    await reload();

    // riallinea selected con l’item aggiornato
    try {
      const fresh = (await (await fetch(`${API}/items`)).json()) as Item[];
      const found = Array.isArray(fresh)
        ? fresh.find((x) => x.sku === sku)
        : null;
      if (found) setSelected(found);
    } catch {
      // non blocchiamo il flusso
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <h2>Articoli</h2>

      <input
        placeholder="Cerca SKU o nome"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={inp}
      />

      {err && <div style={{ color: "red" }}>{err}</div>}

      {/* CREATE */}
      <div style={card}>
        <strong>Nuovo articolo</strong>

        <div style={grid}>
          {/* RIGA 1 */}
          <input
            value={newSku}
            onChange={(e) => setNewSku(e.target.value)}
            placeholder="SKU"
            style={span(3)}
          />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome"
            style={span(6)}
          />
          <input
            value={newBrand}
            onChange={(e) => setNewBrand(e.target.value)}
            placeholder="Brand (opzionale)"
            style={span(3)}
          />

          {/* RIGA 2 */}
          <input
            type="number"
            min={1}
            value={newPackSize}
            onChange={(e) => setNewPackSize(e.target.value)}
            placeholder="Pack size (opzionale, es. 24)"
            style={span(3)}
          />

          <select
            value={newCategoryId}
            onChange={(e) => setNewCategoryId(e.target.value as any)}
            style={span(4)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>

          <select
            value={newSupplier}
            onChange={(e) => setNewSupplier(e.target.value as Supplier)}
            style={span(2)}
          >
            {SUPPLIERS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>

          <select
            value={newStockKind}
            onChange={(e) => setNewStockKind(e.target.value as StockKind)}
            style={span(3)}
          >
            <option value="UNIT">PZ (pezzi)</option>
            <option value="VOLUME_CONTAINER">CL (volume)</option>
          </select>

          {/* RIGA 3 */}
          {newStockKind === "UNIT" ? (
            <input
              type="number"
              value={newUnitToCl}
              onChange={(e) => setNewUnitToCl(+e.target.value)}
              placeholder="CL per 1 PZ (es. 33)"
              style={span(3)}
            />
          ) : (
            <>
              <input
                type="number"
                value={newContainerSizeCl}
                onChange={(e) => setNewContainerSizeCl(Number(e.target.value))}
                placeholder="CL contenitore (es. 70)"
                style={span(3)}
              />
              <input
                value={newContainerLabel}
                onChange={(e) => setNewContainerLabel(e.target.value)}
                placeholder="Etichetta (es. Bottiglia)"
                style={span(3)}
              />
            </>
          )}

          <input
            type="number"
            value={newMinStockCl}
            onChange={(e) => setNewMinStockCl(+e.target.value)}
            placeholder="Scorta minima (CL)"
            style={span(3)}
          />

          <input
            value={newLastCostEuro}
            onChange={(e) => setNewLastCostEuro(e.target.value)}
            placeholder="Costo (EUR)"
            style={span(3)}
          />

          <input
            value={newImageUrl}
            onChange={(e) => setNewImageUrl(e.target.value)}
            placeholder="Foto URL (opzionale)"
            style={span(6)}
          />
        </div>

        <button onClick={createItem} disabled={loading}>
          Crea
        </button>
      </div>

      {/* LIST */}
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Nome</th>
            <th>Categoria</th>
            <th>Fornitore</th>
            <th>Tipo</th>
            <th>Azioni</th>
          </tr>
        </thead>

        <tbody>
          {filtered.map((it) => (
            <tr key={it.itemId}>
              <td>{it.sku}</td>
              <td>{it.name}</td>
              <td>
                {CATEGORIES.find((c) => c.id === normalizeCategoryId(it.categoryId))
                  ?.label ?? it.categoryId}
              </td>
              <td>{it.supplier ?? "VARI"}</td>
              <td>{it.stockKind === "UNIT" ? "PZ" : "CL"}</td>
              <td>
                <button onClick={() => openDetails(it)} disabled={loading}>
                  Apri
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* MODAL */}
      <ItemDetailsModal
        open={detailsOpen}
        item={selected}
        onClose={closeDetails}
        onSavePatch={savePatch}
        loading={loading}
      />
    </div>
  );
}

/* STILI */
const inp: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #ccc",
};

const card: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: 14,
  borderRadius: 14,
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(12, 1fr)",
  gap: 10,
};

const span = (n: number): React.CSSProperties => ({
  ...inp,
  gridColumn: `span ${n}`,
});
