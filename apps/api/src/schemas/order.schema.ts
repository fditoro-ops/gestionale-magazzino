import { z } from "zod";

export const SupplierSchema = z.enum(["DORECA", "ALPORI", "VARI"]);
export const StatusSchema = z.enum([
  "DRAFT",
  "SENT",
  "PARTIAL",
  "RECEIVED",
  "CANCELLED",
]);

const SkuSchema = z.string().min(1).transform((s) => s.toUpperCase().trim());

const NullableNotesSchema = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    const trimmed = v.trim();
    return trimmed === "" ? null : trimmed;
  },
  z.string().min(1).nullable()
);

const OrderLineCreateSchema = z.object({
  sku: SkuSchema,
  qtyOrderedConf: z.number().int().positive(),
});

export const CreateOrderSchema = z.object({
  supplier: SupplierSchema,
  notes: NullableNotesSchema.optional(),
  lines: z.array(OrderLineCreateSchema).min(1),
});

const OrderLinePatchSchema = z.object({
  sku: SkuSchema,
  qtyOrderedConf: z.number().int().positive(),
});

export const UpdateOrderSchema = z.object({
  supplier: SupplierSchema.optional(),
  notes: NullableNotesSchema.optional(),
  lines: z.array(OrderLinePatchSchema).min(1).optional(),
});

export const ReceiveOrderSchema = z.object({
  note: z.preprocess(
    (v) => {
      if (typeof v !== "string") return v;
      const trimmed = v.trim();
      return trimmed === "" ? undefined : trimmed;
    },
    z.string().min(1).optional()
  ),
  lines: z.array(
    z.object({
      sku: SkuSchema,
      qtyReceivedNowConf: z.number().int().positive(),
    })
  ).min(1),
});
