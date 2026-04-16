import { useEffect, useState } from "react";
import WarehouseTable from "../components/WarehouseTable";

const API_URL = import.meta.env.VITE_API_URL;

export default function WarehousePage() {
  const [rows, setRows] = useState([]);
  const [showInactive, setShowInactive] = useState(false);

  async function fetchStock() {
    try {
      const res = await fetch(
        `${API_URL}/stock-v2?showInactive=${showInactive}`
      );
      const data = await res.json();

      setRows(data.rows || []);
    } catch (err) {
      console.error("Errore caricamento stock", err);
    }
  }

  useEffect(() => {
    fetchStock();
  }, [showInactive]);

  return (
    <div style={{ padding: 16 }}>
      <h2>Magazzino</h2>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "flex", gap: 8 }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Mostra prodotti disattivi
        </label>
      </div>

      <WarehouseTable rows={rows} />
    </div>
  );
}
