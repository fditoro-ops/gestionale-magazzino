export type MovementType = "IN" | "OUT" | "ADJUST" | "INVENTORY";

export type MovementReason =
  | "VENDITA"
  | "RESO_CLIENTE"
  | "SCARTO"
  | "FURTO"
  | "RETTIFICA"
  | "INVENTARIO"
  | "RICEZIONE_ORDINE"
  | "SCARICO_RICETTA_CIC"
  | "STORNO_RICETTA_CIC";

export type Movement = {
  id: string;
  sku: string;
  quantity: number;
  type: MovementType;
  reason?: MovementReason;
  note?: string;
  date: string;

  // documento origine
  documento?: string;

  // multi tenant
  tenant_id?: string;

  // --- campi futuri POS / ricette (opzionali) ---

  recipe_name?: string;   // es: Gin Tonic
  recipe_sku?: string;    // es: SKU000205
  sold_qty?: number;      // quanti drink venduti
  line_group?: string;    // raggruppamento ingredienti ricetta
};
