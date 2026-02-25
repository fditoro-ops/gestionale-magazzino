import { z } from "zod";

const SupplierSchema = z.enum(["DORECA", "ALPORI", "VARI"]);
const StatusSchema = z.enum(["DRAFT", "SENT", "PARTIAL", "RECEIVED"]);

const OrderLineCreate = z.object({
  sku: z.string().min(1).transform((s) => s.toUpperCase().trim()),
  qtyOrderedConf: z.number().int().positive(),
});

export const CreateOrderSchema = z.object({
  supplier: SupplierSchema,
  notes: z.string().trim().min(1).nullable().optional(),
  lines: z.array(OrderLineCreate).min(1),
});

const OrderLineUpdate = z.object({
  sku: z.string().min(1).transform((s) => s.toUpperCase().trim()),
  qtyOrderedConf: z.number().int().positive(),
  qtyReceivedConf: z.number().int().min(0).default(0),
});

export const UpdateOrderSchema = z.object({
  supplier: SupplierSchema.optional(),
  status: StatusSchema.optional(),
  notes: z.string().trim().min(1).nullable().optional(),
  lines: z.array(OrderLineUpdate).optional(),
});

export const ReceiveOrderSchema = z.object({
  note: z.string().trim().min(1).optional(),
  lines: z.array(
    z.object({
      sku: z.string().min(1).transform((s) => s.toUpperCase().trim()),
      qtyReceivedNowConf: z.number().int().positive(),
    })
  ).min(1),
});
