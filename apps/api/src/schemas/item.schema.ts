import { z } from "zod";

export const CategoryId = z.enum([
  "bevande",
  "vino",
  "birra",
  "amari",
  "distillati_altri",
  "gin",
  "vodka",
  "whiskey",
  "rhum",
  "tequila",
]);

const StockKind = z.enum(["UNIT", "VOLUME_CONTAINER"]);
const Supplier = z.enum(["DORECA", "ALPORI", "VARI"]);

export const CreateItemSchema = z
  .object({
    sku: z.string().min(1).transform((s) => s.toUpperCase().trim()),
    name: z.string().min(1),

    categoryId: CategoryId,
    supplier: Supplier.default("VARI"),

    active: z.boolean().default(true),

    stockKind: StockKind,

    minStockCl: z.number().min(0).default(0),

    unitToCl: z.number().positive().optional(),
    containerSizeCl: z.number().positive().optional(),
    containerLabel: z.string().min(1).optional(),

    brand: z.string().trim().min(1).nullable().optional(),
    packSize: z.number().int().positive().nullable().optional(),

    imageUrl: z.string().url().nullable().optional(),

    lastCostCents: z.number().min(0).int().nullable().optional(),
    costCurrency: z.literal("EUR").default("EUR"),
  })
  .superRefine((data, ctx) => {
    if (data.stockKind === "UNIT" && !data.unitToCl) {
      ctx.addIssue({
        path: ["unitToCl"],
        code: z.ZodIssueCode.custom,
        message: "unitToCl obbligatorio per stockKind=UNIT",
      });
    }

    if (data.stockKind === "VOLUME_CONTAINER" && !data.containerSizeCl) {
      ctx.addIssue({
        path: ["containerSizeCl"],
        code: z.ZodIssueCode.custom,
        message: "containerSizeCl obbligatorio per stockKind=VOLUME_CONTAINER",
      });
    }
  });

export const UpdateItemSchema = z.object({
  name: z.string().min(1).optional(),
  categoryId: CategoryId.optional(),
  supplier: Supplier.optional(),

  active: z.boolean().optional(),

  stockKind: StockKind.optional(),
  minStockCl: z.number().min(0).optional(),

  unitToCl: z.number().positive().optional(),
  containerSizeCl: z.number().positive().optional(),
  containerLabel: z.string().min(1).optional(),

  brand: z.string().trim().min(1).nullable().optional(),
  packSize: z.number().int().positive().nullable().optional(),

  imageUrl: z.string().url().nullable().optional(),

  lastCostCents: z.number().min(0).int().nullable().optional(),
  costCurrency: z.literal("EUR").optional(),
});

export type CreateItemInput = z.infer<typeof CreateItemSchema>;
export type UpdateItemInput = z.infer<typeof UpdateItemSchema>;
