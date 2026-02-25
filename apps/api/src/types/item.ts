// src/types/item.ts
export type Item = {
  sku: string;      // chiave tecnica (immutabile)
  name: string;     // nome leggibile
  active: boolean;  // se utilizzabile
};
