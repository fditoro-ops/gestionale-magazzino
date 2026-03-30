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
import CashClosurePage from "./pages/CashClosurePage";
import RecipesPage from "./components/RecipesPage";
import CicIntegrationPage from "./pages/CicIntegrationPage";

type WarehouseRow = {
  itemId: string;
  sku: string;
  name: string;
  stockBt: number;
  minStockBt: number | null;
  underMin: boolean;
  packSize?: number | null;
  baseQty?: number | null;
  um?: string | null;
  minStockUnits?: number | null;
};

function CoreApp() {
  const [tab, setTab] = useState<TabKey>("movements");
  const [mode, setMode] = useState<"live" | "historical">("live");

  const [movements, setMovements] = useState<Movement[]>([]);
  const [warehouse, setWarehouse] = useState<WarehouseRow[]>([]);
  const [draftSku, setDraftSku] = useState<string>("");

  const [items, setItems] = useState<any[]>([]);
  const [salesDocuments, setSalesDocuments] = useState<any[]>([]);
  const [salesLines, setSalesLines] = useState<any[]>([]);

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

  const warehouseRowsEnriched = useMemo(() => {
    const warehouseArr = Array.isArray(warehouse) ? warehouse : [];
    const itemsArr = Array.isArray(items) ? items : [];

    const itemBySku = new Map(
      itemsArr.map((it) => [String(it.sku || "").toUpperCase(), it])
    );

    return warehouseArr.map((row) => {
      const sku = String(row.sku || "").toUpperCase();
      const item = itemBySku.get(sku);

      const stockBt = Number(row.stockBt ?? 0);
      const um = String(item?.um ?? row.um ?? "").toUpperCase();
      const baseQty = Number(item?.baseQty ?? row.baseQty ?? 0);
      const minStockUnits =
        item?.minStockUnits != null ? Number(item.minStockUnits) : null;

      const units =
        um === "PZ"
          ? stockBt
          : baseQty > 0
          ? stockBt / baseQty
          : null;

      const underMin =
        units != null &&
        minStockUnits != null &&
        Number.isFinite(minStockUnits) &&
        minStockUnits > 0 &&
        units < minStockUnits;

      return {
        ...row,
        packSize: item?.packSize ?? null,
        baseQty: item?.baseQty ?? null,
        um: item?.um ?? null,
        minStockUnits,
        underMin,
      };
    });
  }, [warehouse, items]);

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

    authFetch(`/dashboard/sales`)
      .then((r) => r.json())
      .then((data) => {
        setSalesDocuments(Array.isArray(data?.documents) ? data.documents : []);
        setSalesLines(Array.isArray(data?.lines) ? data.lines : []);
      })
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
            <DashboardPage
              salesDocuments={salesDocuments}
              salesLines={salesLines}
            />
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
              rows={warehouseRowsEnriched}
              onPickSku={(sku) => {
                setDraftSku(sku);
                setTab("movements");
              }}
            />
          )}

          {tab === "items" && <ItemsAdmin />}

          {tab === "recipes" && <RecipesPage />}

          {tab === "cic" && <CicIntegrationPage />}

          {tab === "cashClosure" && <CashClosurePage />}

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
