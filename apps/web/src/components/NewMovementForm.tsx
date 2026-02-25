import { useEffect, useState } from "react";

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
  packSizeBySku,          // ✅ NUOVO
  defaultSku,
}: {
  onSuccess: () => void;
  availableBySku: Record<string, number>;
  packSizeBySku: Record<string, number | null>; // ✅ NUOVO
  defaultSku?: string;
}) {
  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [type, setType] = useState<MovementType>("IN");
  const [reason, setReason] = useState<MovementReason | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Precompila SKU
  useEffect(() => {
    if (defaultSku) setSku(defaultSku);
  }, [defaultSku]);

  const skuKey = sku.toUpperCase().trim();
  const available = skuKey ? availableBySku?.[skuKey] ?? 0 : 0;

  // ✅ packSize (es. 24 per cassa COCA)
  const packSize = skuKey ? packSizeBySku?.[skuKey] ?? null : null;

  // ✅ quantità reale che andrà a stock
  const effectiveQty =
    type === "IN" && packSize && packSize > 1
      ? quantity * packSize
      : quantity;

  const needsReason = type === "OUT" || type === "ADJUST";

  const wouldGoNegative =
    (type === "OUT" || type === "ADJUST") && effectiveQty > available;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!skuKey) {
      setError("Inserisci uno SKU valido");
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

    const payload: any = {
      sku: skuKey,
      quantity: effectiveQty, // ✅ QUI AVVIENE LA MAGIA
      type,
      note: note || undefined,
    };

    if (type === "INVENTORY") {
      payload.reason = "INVENTARIO";
    } else if (needsReason) {
      payload.reason = reason;
    }

    const res = await fetch("http://localhost:3001/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore");
      setLoading(false);
      return;
    }

    // reset
    setSku("");
    setQuantity(0);
    setType("IN");
    setReason("");
    setNote("");
    setLoading(false);
    onSuccess();
  }

  return (
    <form onSubmit={submit} className="p-4 border rounded space-y-3 bg-white">
      <h2 className="font-bold">Nuovo movimento</h2>

      <input
        className="border p-2 w-full"
        placeholder="SKU"
        value={sku}
        onChange={(e) => setSku(e.target.value)}
        required
      />

      {skuKey && (
        <p className="text-sm text-gray-600">
          Disponibile: <strong>{available}</strong>
        </p>
      )}

      {type === "IN" && packSize && packSize > 1 && quantity > 0 && (
        <p className="text-sm text-blue-600">
          Carico: {quantity} × {packSize} ={" "}
          <strong>{effectiveQty}</strong> pz
        </p>
      )}

      <input
        className="border p-2 w-full"
        type="number"
        min={1}
        placeholder="Quantità"
        value={quantity}
        onChange={(e) => setQuantity(Number(e.target.value))}
        required
      />

      <select
        className="border p-2 w-full"
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
          className="border p-2 w-full"
          value={reason}
          onChange={(e) => setReason(e.target.value as MovementReason)}
          required
        >
          <option value="">Seleziona reason</option>
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      )}

      <textarea
        className="border p-2 w-full"
        placeholder="Nota (opzionale)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      {error && <p className="text-red-600">{error}</p>}

      <button
        disabled={loading || wouldGoNegative}
        className={`px-4 py-2 rounded text-white ${
          loading || wouldGoNegative
            ? "bg-gray-400"
            : "bg-blue-600 hover:bg-blue-700"
        }`}
      >
        {loading ? "Salvataggio..." : "Salva"}
      </button>
    </form>
  );
}
