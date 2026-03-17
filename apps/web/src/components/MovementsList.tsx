import { useMemo, useState } from "react";
import type { Movement } from "../types/movement";

type ItemLite = {
  sku: string;
  name?: string;
};

type Props = {
  movements: Movement[];
  items: ItemLite[];
};

type UiMovement = Movement & {
  at?: string;
  kind?: string;

  documento?: string;
  documentId?: string;
  docType?: string;
  source?: string;

  recipe_name?: string;
  recipe_sku?: string;
  sold_qty?: number;
  line_group?: string;
};

type EventTypeFilter = "ALL" | "IN" | "OUT" | "ADJUST" | "INVENTORY";

type MovementEvent = {
  key: string;
  title: string;
  subtitle: string;
  eventType: string;
  eventAt?: string;
  rows: UiMovement[];
  recipeGroups: {
    key: string;
    recipeName?: string;
    recipeSku?: string;
    soldQty?: number;
    rows: UiMovement[];
  }[];
};

function formatDateTime(value?: string) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString();
}

function formatDocumentoLabel(doc?: string | null, note?: string | null) {
  const rawDoc = String(doc ?? "").trim();
  if (!rawDoc) return "";

  if (rawDoc.startsWith("CIC-")) {
    const match = String(note ?? "").match(/scontrino\s+(\d+)/i);
    if (match?.[1]) {
      return `Scontrino ${match[1]}`;
    }
  }

  return rawDoc;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function getMovementType(m: UiMovement) {
  return String(m.type ?? m.kind ?? "").toUpperCase();
}

function getMovementDate(m: UiMovement) {
  return String(m.date ?? m.at ?? "");
}

function getMovementQty(m: UiMovement) {
  return Number(m.quantity ?? 0);
}

function getBadgeClass(type: string) {
  if (type === "IN") {
    return "bg-green-50/80 text-green-700 border-green-200/60";
  }
  if (type === "OUT") {
    return "bg-red-50/80 text-red-700 border-red-200/60";
  }
  if (type === "ADJUST") {
    return "bg-amber-50/80 text-amber-700 border-amber-200/60";
  }
  return "bg-sky-50/80 text-sky-700 border-sky-200/60";
}

function getQtyClass(type: string) {
  if (type === "IN") return "text-green-700";
  if (type === "OUT") return "text-red-700";
  if (type === "ADJUST") return "text-amber-700";
  return "text-sky-700";
}

function getQtySign(type: string) {
  return type === "IN" || type === "INVENTORY" ? "+" : "−";
}

function getEventTypeLabel(type: string) {
  if (type === "IN") return "Carico";
  if (type === "OUT") return "Scarico";
  if (type === "ADJUST") return "Rettifica";
  if (type === "INVENTORY") return "Inventario";
  return type || "Movimento";
}

function isMovementInRange(dateValue: string, from: string, to: string) {
  if (!dateValue) return true;

  const time = new Date(dateValue).getTime();
  if (Number.isNaN(time)) return true;

  if (from) {
    const fromTime = new Date(`${from}T00:00:00`).getTime();
    if (time < fromTime) return false;
  }

  if (to) {
    const toTime = new Date(`${to}T23:59:59`).getTime();
    if (time > toTime) return false;
  }

  return true;
}

export default function MovementsList({ movements, items }: Props) {
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState<EventTypeFilter>("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  const itemNameBySku = useMemo(() => {
    const map = new Map<string, string>();

    for (const item of items) {
      const sku = String(item.sku ?? "").trim().toUpperCase();
      const name = String(item.name ?? "").trim();
      if (sku) map.set(sku, name || sku);
    }

    return map;
  }, [items]);

  const normalizedMovements = useMemo<UiMovement[]>(() => {
    return [...movements]
      .map((m) => ({
        ...(m as UiMovement),
        sku: String(m.sku ?? "").trim().toUpperCase(),
      }))
      .sort((a, b) => {
        const bd = getMovementDate(b);
        const ad = getMovementDate(a);
        return new Date(bd).getTime() - new Date(ad).getTime();
      });
  }, [movements]);

  const filteredMovements = useMemo(() => {
    const q = normalizeText(query);

    return normalizedMovements.filter((m) => {
      const type = getMovementType(m);
      const dateValue = getMovementDate(m);
      const sku = String(m.sku ?? "").toUpperCase();
      const itemName = itemNameBySku.get(sku) || sku;

      if (eventType !== "ALL" && type !== eventType) return false;
      if (!isMovementInRange(dateValue, fromDate, toDate)) return false;

      if (!q) return true;

      const haystack = [
        sku,
        itemName,
        m.reason,
        m.note,
        m.documento,
        m.documentId,
        m.docType,
        m.source,
        m.recipe_name,
        m.recipe_sku,
        getEventTypeLabel(type),
      ]
        .map(normalizeText)
        .join(" ");

      return haystack.includes(q);
    });
  }, [normalizedMovements, itemNameBySku, eventType, fromDate, toDate, query]);

  const events = useMemo<MovementEvent[]>(() => {
    const map = new Map<string, UiMovement[]>();

    for (const movement of filteredMovements) {
      const type = getMovementType(movement);
      const dt = getMovementDate(movement);
      const isoMinute = dt ? new Date(dt).toISOString().slice(0, 16) : "no-date";

      const documentKey =
        normalizeText(movement.documento) ||
        normalizeText(movement.documentId) ||
        "";

      const fallbackKey = `${type}|${isoMinute}|${normalizeText(movement.reason)}`;

      const key = documentKey ? `doc:${documentKey}` : `fallback:${fallbackKey}`;

      const list = map.get(key) ?? [];
      list.push(movement);
      map.set(key, list);
    }

    const grouped: MovementEvent[] = [];

    for (const [key, rows] of map.entries()) {
      const orderedRows = [...rows].sort((a, b) => {
        const bd = getMovementDate(b);
        const ad = getMovementDate(a);
        return new Date(bd).getTime() - new Date(ad).getTime();
      });

      const first = orderedRows[0];
      const firstType = getMovementType(first);
      const firstDate = getMovementDate(first);

      const recipeMap = new Map<
        string,
        {
          key: string;
          recipeName?: string;
          recipeSku?: string;
          soldQty?: number;
          rows: UiMovement[];
        }
      >();

      for (const row of orderedRows) {
        const recipeKey =
          normalizeText(row.line_group) ||
          normalizeText(row.recipe_sku) ||
          normalizeText(row.recipe_name) ||
          `row:${row.id ?? `${row.sku}-${getMovementDate(row)}`}`;

        if (!recipeMap.has(recipeKey)) {
          recipeMap.set(recipeKey, {
            key: recipeKey,
            recipeName: row.recipe_name,
            recipeSku: row.recipe_sku,
            soldQty: row.sold_qty != null ? Number(row.sold_qty) : undefined,
            rows: [],
          });
        }

        recipeMap.get(recipeKey)!.rows.push(row);
      }

      const recipeGroups = Array.from(recipeMap.values());

const rawDocumentLabel = first.documento ?? first.documentId ?? undefined;

const documentLabel = formatDocumentoLabel(
  rawDocumentLabel,
  first.note ?? undefined
);

const title = documentLabel
  ? `${getEventTypeLabel(firstType)} • ${documentLabel}`
  : `${getEventTypeLabel(firstType)} • ${formatDateTime(firstDate)}`;

      const subtitleParts = [
        first.source ? `Origine: ${first.source}` : "",
        first.reason ? `Motivo: ${first.reason}` : "",
        `${orderedRows.length} movimenti`,
      ].filter(Boolean);

      grouped.push({
        key,
        title,
        subtitle: subtitleParts.join(" · "),
        eventType: firstType,
        eventAt: firstDate,
        rows: orderedRows,
        recipeGroups,
      });
    }

    return grouped.sort((a, b) => {
      const bt = new Date(a.eventAt ?? "").getTime();
      const at = new Date(b.eventAt ?? "").getTime();
      return at - bt;
    });
  }, [filteredMovements]);

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const clearFilters = () => {
    setQuery("");
    setEventType("ALL");
    setFromDate("");
    setToDate("");
  };

  const totalRows = filteredMovements.length;

  return (
    <div className="panel-glass p-6 space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Movimentazione
          </h2>
          <div className="text-sm text-gray-500">
            Storico eventi di magazzino
          </div>
        </div>

        <div className="text-xs text-gray-500">
          {events.length} eventi · {totalRows} movimenti
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Ricerca
          </label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca SKU, prodotto, motivo, documento..."
            className="w-full rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm outline-none focus:border-gray-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Tipo
          </label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as EventTypeFilter)}
            className="w-full rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm outline-none focus:border-gray-400"
          >
            <option value="ALL">Tutti</option>
            <option value="IN">Carichi</option>
            <option value="OUT">Scarichi</option>
            <option value="ADJUST">Rettifiche</option>
            <option value="INVENTORY">Inventari</option>
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="button"
            onClick={clearFilters}
            className="w-full rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-white"
          >
            Pulisci filtri
          </button>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Data da
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm outline-none focus:border-gray-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Data a
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm outline-none focus:border-gray-400"
          />
        </div>
      </div>

      {events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white/30 px-4 py-10 text-center text-sm text-gray-500">
          Nessun movimento trovato con i filtri attuali.
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => {
            const expanded = !!expandedKeys[event.key];
            const badgeClass = getBadgeClass(event.eventType);

            return (
              <div
                key={event.key}
                className="rounded-2xl border border-gray-200/70 bg-white/50 shadow-sm backdrop-blur-sm"
              >
                <button
                  type="button"
                  onClick={() => toggleExpanded(event.key)}
                  className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left transition hover:bg-white/40"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeClass}`}
                      >
                        {getEventTypeLabel(event.eventType)}
                      </span>

                      <div className="truncate font-medium text-gray-900">
                        {event.title}
                      </div>
                    </div>

                    <div className="mt-1 text-sm text-gray-500">
                      {formatDateTime(event.eventAt)}
                      {event.subtitle ? ` · ${event.subtitle}` : ""}
                    </div>
                  </div>

                  <div className="shrink-0 text-xs font-medium text-gray-500">
                    {expanded ? "Chiudi" : "Apri"}
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-gray-200/70 px-4 py-4">
                    <div className="space-y-4">
                      {event.recipeGroups.map((group) => {
                        const showGroupHeader =
                          !!group.recipeName ||
                          !!group.recipeSku ||
                          group.rows.length > 1;

                        return (
                          <div
                            key={group.key}
                            className="rounded-xl border border-gray-100 bg-white/60 p-3"
                          >
                            {showGroupHeader && (
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <div className="font-medium text-gray-900">
                                    {group.recipeName ||
                                      group.recipeSku ||
                                      "Dettaglio movimento"}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {group.recipeSku
                                      ? `${group.recipeSku}`
                                      : "Raggruppamento automatico"}
                                    {group.soldQty != null
                                      ? ` · Qtà venduta: ${group.soldQty}`
                                      : ""}
                                  </div>
                                </div>

                                <div className="text-xs text-gray-500">
                                  {group.rows.length} righe
                                </div>
                              </div>
                            )}

                            <ul className="divide-y divide-gray-100">
                              {group.rows.map((m) => {
                                const type = getMovementType(m);
                                const qty = getMovementQty(m);
                                const sku = String(m.sku ?? "").toUpperCase();
                                const itemName = itemNameBySku.get(sku) || sku;
                                const sign = getQtySign(type);
                                const qtyClass = getQtyClass(type);

                                return (
                                  <li
                                    key={
                                      m.id ??
                                      `${sku}-${getMovementDate(m)}-${type}-${qty}`
                                    }
                                    className="flex items-center justify-between gap-4 py-3"
                                  >
                                    <div className="min-w-0">
                                      <div className="font-medium text-gray-900">
                                        {itemName}
                                      </div>
                                      <div className="text-sm text-gray-500">
                                        {sku}
                                        {m.reason ? ` · ${m.reason}` : ""}
                                        {m.note ? ` · ${m.note}` : ""}
                                      </div>
                                    </div>

                                    <div className="shrink-0 text-right">
                                      <div
                                        className={`font-semibold tabular-nums ${qtyClass}`}
                                      >
                                        {sign}
                                        {qty}
                                      </div>
                                      <div className="text-xs text-gray-400">
                                        {formatDateTime(getMovementDate(m))}
                                      </div>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
