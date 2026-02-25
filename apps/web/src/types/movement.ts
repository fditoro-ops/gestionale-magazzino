export type Movement = {
  id?: string;
  sku: string;

  // Core fields
  qty: number;
  kind?: string;
  at?: string; // ISO date
  note?: string | null;

  // ✅ Aliases usati in UI (compatibilità)
  quantity?: number;
  type?: string;
  date?: string;
  reason?: string | null;
};
