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

  documento?: string;
  tenant_id?: string;

  // campi futuri opzionali
  recipe_name?: string;
  recipe_sku?: string;
  sold_qty?: number;
  line_group?: string;
};
