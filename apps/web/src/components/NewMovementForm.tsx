import { useEffect, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type MovementType = "IN" | "OUT" | "ADJUST" | "INVENTORY";

type MovementReason =
  | "VENDITA"
  | "RESO_CLIENTE"
  | "SCARTO"
  | "FURTO"
  | "RETTIFICA"
  | "INVENTARIO";

const REASONS: MovementReason[] = [
  "VENDITA",
  "RESO_CLIENTE",
  "SCARTO",
  "FURTO",
  "RETTIFICA",
];

export default function NewMovementForm({
  onSuccess,
  availableBySku,
  packSizeBySku,
  defaultSku,
}: {
  onSuccess: () => void;
  availableBySku: Record<string, number>;
  packSizeBySku: Record<string, number | null>;
  defaultSku?: string;
}) {
  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [type, setType] = useState<MovementType>("IN");
  const [reason, setReason] = useState<MovementReason | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (defaultSku) setSku(defaultSku);
  }, [defaultSku]);

  const skuKey = sku.toUpperCase().trim();
  const available = skuKey ? availableBySku?.[skuKey] ?? 0 : 0;
  const packSize = skuKey ? packSizeBySku?.[skuKey] ?? null : null;

  const effectiveQty =
    type === "IN" && packSize && packSize > 1
      ? quantity * packSize
      : quantity;

  const needsReason = type === "OUT" || type === "ADJUST";

  const wouldGoNegative =
    (type === "OUT" || type === "ADJUST") && effectiveQty > available;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError(null);

    if (!skuKey) {
      setError("Inserisci uno SKU valido");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Inserisci una quantità valida");
      return;
    }

    if (needsReason && !reason) {
      setError("Seleziona una reason obbligatoria");
      return;
    }

    if ((type === "OUT" || type === "ADJUST") && effectiveQty > available) {
      setError(
        `Stock insufficiente. Disponibile: ${available}, richiesto: ${effectiveQty}`
      );
      return;
    }

    setLoading(true);

    try {
      const payload: any = {
        sku: skuKey,
        quantity: effectiveQty,
        type,
        note: note.trim() || undefined,
      };

      if (type === "INVENTORY") {
        payload.reason = "INVENTARIO";
      } else if (needsReason) {
        payload.reason = reason;
      }

      const res = await fetch(`${API_BASE}/movements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Errore nel salvataggio");
      }

      setSku("");
      setQuantity(0);
      setType("IN");
      setReason("");
      setNote("");
      onSuccess();
    } catch (err: any) {
      console.error("Errore salvataggio movimento:", err);
      setError(err?.message || "Errore di rete o server non raggiungibile");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel-glass p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">
          Nuovo movimento
        </h2>

        {skuKey && (
          <div className="text-sm text-gray-600">
            Disponibile: <span className="font-semibold">{available}</span>
          </div>
        )}
      </div>

      <div className="max-w-md">
        <input
          className="w-full h-10 rounded-lg border border-gray-200 bg-white/80 backdrop-blur-sm px-3 text-sm outline-none focus:ring-2 focus:ring-teal-600/30"
          placeholder="SKU"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl">
        <input
          className="h-10 rounded-lg border border-gray-200 bg-white/80 backdrop-blur-sm px-3 text-sm outline-none focus:ring-2 focus:ring-teal-600/30"
          type="number"
          min={1}
          placeholder="Quantità"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          required
        />

        <select
          className="h-10 rounded-lg border border-gray-200 bg-white/80 backdrop-blur-sm px-3 text-sm outline-none focus:ring-2 focus:ring-teal-600/30"
          value={type}
          onChange={(e) => {
            const next = e.target.value as MovementType;
            setType(next);
            if (next === "IN" || next === "INVENTORY") {
              setReason("");
            }
          }}
        >
          <option value="IN">IN</option>
          <option value="OUT" disabled={available <= 0}>
            OUT
          </option>
          <option value="ADJUST" disabled={available <= 0}>
            ADJUST
          </option>
          <option value="INVENTORY">INVENTORY</option>
        </select>

        {needsReason && (
          <select
            className="h-10 rounded-lg border border-gray-200 bg-white/80 backdrop-blur-sm px-3 text-sm outline-none focus:ring-2 focus:ring-teal-600/30"
            value={reason}
            onChange={(e) => setReason(e.target.value as MovementReason)}
            required
          >
            <option value="">Reason</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="max-w-2xl">
        <textarea
          className="w-full rounded-lg border border-gray-200 bg-white/80 backdrop-blur-sm px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600/30"
          placeholder="Nota (opzionale)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200/60 bg-red-50/60 px-3 py-2 text-sm text-red-700 max-w-2xl">
          {error}
        </div>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={loading || wouldGoNegative}
          className={`btn-primary ${
            loading || wouldGoNegative ? "opacity-60 pointer-events-none" : ""
          }`}
        >
          {loading ? "Salvataggio..." : "Salva"}
        </button>
      </div>
    </form>
  );
}
