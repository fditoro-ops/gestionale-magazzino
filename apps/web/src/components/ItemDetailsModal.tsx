import { useEffect, useMemo, useState } from "react";
import { X, Power, ChevronDown } from "lucide-react";

export type Item = {
  itemId?: string;
  sku: string;
  name?: string;
  brand?: string | null;

  categoryId?: string | null;
  category?: string | null;
  supplier?: string | null;

  um?: "CL" | "PZ" | null;
  baseQty?: number | null;

  packSize?: number | null;

  lastCostCents?: number | null;
  costEur?: number | null;
  costCurrency?: string | null;

  imageUrl?: string | null;
  active?: boolean;
};

type ItemUm = "CL" | "PZ";

function centsToEuroString(cents: number | null | undefined) {
  if (typeof cents !== "number") return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

function euroToCents(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function parsePositiveNumber(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

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
  loading?: boolean;
}) {
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [supplier, setSupplier] = useState("VARI");
  const [categoryId, setCategoryId] = useState("");

  const [packSize, setPackSize] = useState("");
  const [um, setUm] = useState<ItemUm>("PZ");
  const [baseQty, setBaseQty] = useState("");

  const [lastCostEuro, setLastCostEuro] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open || !item) return;

    setErr(null);

    setName(item.name ?? "");
    setBrand(item.brand ?? "");
    setSupplier(item.supplier ?? "VARI");
    setCategoryId(item.categoryId ?? item.category ?? "");

    const ps = Number(item.packSize);
    setPackSize(Number.isFinite(ps) && ps > 0 ? String(ps) : "");

    const nextUm: ItemUm = item.um === "CL" ? "CL" : "PZ";
    setUm(nextUm);

    const bq = Number(item.baseQty);
    setBaseQty(
      Number.isFinite(bq) && bq > 0
        ? String(bq)
        : nextUm === "PZ"
        ? "1"
        : ""
    );

    if (item.lastCostCents != null) {
      setLastCostEuro(centsToEuroString(item.lastCostCents));
    } else {
      setLastCostEuro("");
    }

    setImageUrl(item.imageUrl ?? "");
    setActive(item.active ?? true);
  }, [open, item]);

  if (!open || !item) return null;

  async function handleSave() {
    setErr(null);

    if (!name.trim()) {
      setErr("Nome obbligatorio");
      return;
    }

    const parsedPackSize = parsePositiveNumber(packSize);
    const parsedBaseQty = parsePositiveNumber(baseQty);

    if (!parsedBaseQty) {
      setErr("Quantità base non valida");
      return;
    }

    if (um === "PZ" && parsedBaseQty !== 1) {
      setErr("Per PZ deve essere 1");
      return;
    }

    const patch = {
      name: name.trim(),
      brand: brand || null,
      supplier,
      categoryId: categoryId || null,
      category: categoryId || null,

      packSize: parsedPackSize,
      um,
      baseQty: parsedBaseQty,

      lastCostCents: euroToCents(lastCostEuro),
      costCurrency: "EUR",

      imageUrl: imageUrl || null,
      active,
    };

    try {
      await onSavePatch(item.sku, patch);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Errore salvataggio");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl p-4 w-[500px] space-y-3">
        <h3 className="font-bold">{item.sku}</h3>

        {err && <div className="text-red-500 text-sm">{err}</div>}

        <input value={name} onChange={(e) => setName(e.target.value)} />

        <input
          placeholder="Pezzi per cassa"
          value={packSize}
          onChange={(e) => setPackSize(e.target.value)}
        />

        <input
          placeholder="BaseQty"
          value={baseQty}
          onChange={(e) => setBaseQty(e.target.value)}
        />

        <button onClick={handleSave}>
          {loading ? "Salvataggio..." : "Salva"}
        </button>

        <button onClick={onClose}>Chiudi</button>
      </div>
    </div>
  );
}
