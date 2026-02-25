import { useEffect, useMemo, useState } from "react";

import AppLayout from "./components/AppLayout";
import type { TabKey } from "./components/AppLayout";

import NewMovementForm from "./components/NewMovementForm";
import MovementsList from "./components/MovementsList";
import WarehouseTable from "./components/WarehouseTable";
import ItemsAdmin from "./components/ItemsAdmin";
import OrdersPage from "./components/OrdersPage";

import type { Movement } from "./types/movement";

type WarehouseRow = {
  itemId: string;
  sku: string;
  name: string;
  stockBt: number;
  minStockBt: number | null;
  underMin: boolean;
};

export default function App() {
  /* ---------- NAV ---------- */
  const [tab, setTab] = useState<TabKey>("movements");
  const [mode, setMode] = useState<"live" | "historical">("live");

  /* ---------- DATA ---------- */
  const [movements, setMovements] = useState<Movement[]>([]);
  const [warehouse, setWarehouse] = useState<WarehouseRow[]>([]);
  const [draftSku, setDraftSku] = useState<string>("");

  const [items, setItems] = useState<any[]>([]);

  // packSizeBySku: sempre safe
  const packSizeBySku = useMemo(() => {
    const arr = Array.isArray(items) ? items : [];
    return Object.fromEntries(
      arr.map((it) => [String(it.sku || "").toUpperCase(), it.packSize ?? null])
    ) as Record<string, number | null>;
  }, [items]);

  // availableBySku: sempre safe
  const availableBySku = useMemo(() => {
    const arr = Array.isArray(warehouse) ? warehouse : [];
    return Object.fromEntries(
      arr.map((r) => [String(r.sku || "").toUpperCase(), Number(r.stockBt ?? 0)])
    ) as Record<string, number>;
  }, [warehouse]);

  /* ---------- LOAD ---------- */
  const reload = () => {
    fetch("http://localhost:3001/movements")
      .then((r) => r.json())
      .then((data) => setMovements(Array.isArray(data) ? data : []))
      .catch(console.error);

    fetch("http://localhost:3001/stock-v2")
      .then((r) => r.json())
      .then((data) => {
        // supportiamo tutte le forme possibili:
        // - array diretto
        // - { rows: [...] }
        // - { warehouse: [...] }
        // - { data: [...] }
        const rows = Array.isArray(data)
          ? data
          : Array.isArray((data as any)?.rows)
            ? (data as any).rows
            : Array.isArray((data as any)?.warehouse)
              ? (data as any).warehouse
              : Array.isArray((data as any)?.data)
                ? (data as any).data
                : [];
        setWarehouse(rows);
      })
      .catch(console.error);

    fetch("http://localhost:3001/items")
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(console.error);

    // ⚠️ NOTA: niente fetch /orders qui
    // OrdersPage prova da solo a chiamare /orders e se non esiste usa fallback locale.
  };

  useEffect(() => {
    reload();
  }, []);

  /* ---------- UI ---------- */
  return (
    <AppLayout
      tab={tab}
      onTabChange={setTab}
      onReload={reload}
      mode={mode}
      onModeChange={setMode}
    >
      {tab === "dashboard" && (
        <div style={{ padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Dashboard</h2>
          <p style={{ margin: 0, color: "#627D98" }}>Coming soon…</p>
        </div>
      )}

      {tab === "movements" && (
        <div style={{ display: "grid", gap: 16 }}>
          <NewMovementForm
            onSuccess={reload}
            availableBySku={availableBySku}
            defaultSku={draftSku}
            packSizeBySku={packSizeBySku}
          />
          <MovementsList movements={movements} />
        </div>
      )}

      {tab === "warehouse" && (
        <WarehouseTable
          rows={Array.isArray(warehouse) ? warehouse : []}
          onPickSku={(sku) => {
            setDraftSku(sku);
            setTab("movements");
          }}
        />
      )}

      {tab === "items" && <ItemsAdmin />}

      {/* ✅ ORDERS: pagina vera */}
      {tab === "orders" && (
        <OrdersPage
          items={Array.isArray(items) ? items : []}
          onReload={reload}
        />
      )}
    </AppLayout>
  );
}
