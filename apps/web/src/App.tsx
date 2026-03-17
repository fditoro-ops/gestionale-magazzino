import { useEffect, useMemo, useState } from "react";
import { Routes, Route } from "react-router-dom";

import AppLayout from "./components/AppLayout";
import type { TabKey } from "./components/AppLayout";

import NewMovementForm from "./components/NewMovementForm";
import MovementsList from "./components/MovementsList";
import WarehouseTable from "./components/WarehouseTable";
import ItemsAdmin from "./components/ItemsAdmin";
import OrdersPage from "./components/OrdersPage";
import SuppliersPage from "./components/SuppliersPage";

import type { Movement } from "./types/movement";

import LoginPage from "./pages/LoginPage";
import ProtectedRoute from "./auth/ProtectedRoute";
import AuthBar from "./components/AuthBar";
import { authFetch } from "./api/authFetch";
import UsersPage from "./components/UsersPage";
import InventoryPage from "./components/InventoryPage";
import DashboardPage from "./pages/dashboard/DashboardPage";

type WarehouseRow = {
  itemId: string;
  sku: string;
  name: string;
  stockBt: number;
  minStockBt: number | null;
  underMin: boolean;
};

function CoreApp() {
  const [tab, setTab] = useState<TabKey>("movements");
  const [mode, setMode] = useState<"live" | "historical">("live");

  const [movements, setMovements] = useState<Movement[]>([]);
  const [warehouse, setWarehouse] = useState<WarehouseRow[]>([]);
  const [draftSku, setDraftSku] = useState<string>("");

  const [items, setItems] = useState<any[]>([]);

  const packSizeBySku = useMemo(() => {
    const arr = Array.isArray(items) ? items : [];
    return Object.fromEntries(
      arr.map((it) => [String(it.sku || "").toUpperCase(), it.packSize ?? null])
    ) as Record<string, number | null>;
  }, [items]);

  const availableBySku = useMemo(() => {
    const arr = Array.isArray(warehouse) ? warehouse : [];
    return Object.fromEntries(
      arr.map((r) => [String(r.sku || "").toUpperCase(), Number(r.stockBt ?? 0)])
    ) as Record<string, number>;
  }, [warehouse]);

    const reload = () => {
    authFetch(`/movements`)
      .then((r) => r.json())
      .then((data) => setMovements(Array.isArray(data) ? data : []))
      .catch(console.error);

    authFetch(`/stock-v2`)
      .then((r) => r.json())
      .then((data) => {
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

    authFetch(`/items`)
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(console.error);
  };
  useEffect(() => {
    reload();
  }, []);

  return (
    <div className="app-bg">
      <div className="app-bg-content min-h-screen">
        <AuthBar />

        <AppLayout
          tab={tab}
          onTabChange={setTab}
          onReload={reload}
          mode={mode}
          onModeChange={setMode}
        >
          {tab === "dashboard" && (
            <div className="p-4">
              <h2 className="mt-0">Dashboard</h2>
              <p className="m-0 text-slate-500">Coming soon…</p>
            </div>
          )}
{tab === "users" && <UsersPage />}
          {tab === "movements" && (
            <div className="grid gap-4">
              <NewMovementForm
                onSuccess={reload}
                availableBySku={availableBySku}
                defaultSku={draftSku}
                packSizeBySku={packSizeBySku}
              />
              <MovementsList
                movements={movements}
                items={Array.isArray(items) ? items : []}
              />
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

{tab === "inventory" && <InventoryPage />}

{tab === "orders" && (
  <OrdersPage
    items={Array.isArray(items) ? items : []}
    warehouse={Array.isArray(warehouse) ? warehouse : []}
    onReload={reload}
  />
)}

{tab === "suppliers" && <SuppliersPage />}
        </AppLayout>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <CoreApp />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
