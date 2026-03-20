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

const Supplier = z.string().trim().min(1);
const ItemUm = z.enum(["CL", "PZ"]);

const nullableTrimmedString = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1))
  .nullable()
  .optional();

export const CreateItemSchema = z
  .object({
    sku: z.string().min(1).transform((s) => s.toUpperCase().trim()),
    name: z.string().min(1).transform((s) => s.trim()),

    categoryId: CategoryId.optional(),
    category: z.string().trim().min(1).optional(),

    supplier: Supplier.default("VARI"),
    active: z.boolean().default(true),

    um: ItemUm,
    baseQty: z.coerce.number().positive(),

    brand: nullableTrimmedString,
    packSize: z.coerce.number().positive().nullable().optional(),

    imageUrl: z.string().url().nullable().optional(),

    costEur: z.coerce.number().min(0).nullable().optional(),
    lastCostCents: z.coerce.number().int().min(0).nullable().optional(),
    costCurrency: z.literal("EUR").default("EUR"),
  })
  .superRefine((data, ctx) => {
    if (data.um === "PZ" && data.baseQty !== 1) {
      ctx.addIssue({
        path: ["baseQty"],
        code: z.ZodIssueCode.custom,
        message: "Per gli articoli PZ baseQty deve essere 1",
      });
    }

    if (!data.categoryId && !data.category) {
      ctx.addIssue({
        path: ["categoryId"],
        code: z.ZodIssueCode.custom,
        message: "categoryId o category è obbligatorio",
      });
    }
  });

export const UpdateItemSchema = z
  .object({
    name: z.string().min(1).transform((s) => s.trim()).optional(),

    categoryId: CategoryId.optional(),
    category: z.string().trim().min(1).nullable().optional(),

    supplier: Supplier.optional(),
    active: z.boolean().optional(),

    um: ItemUm.optional(),
    baseQty: z.coerce.number().positive().nullable().optional(),

    brand: nullableTrimmedString,
    packSize: z.coerce.number().positive().nullable().optional(),

    imageUrl: z.string().url().nullable().optional(),

    costEur: z.coerce.number().min(0).nullable().optional(),
    lastCostCents: z.coerce.number().int().min(0).nullable().optional(),
    costCurrency: z.literal("EUR").optional(),
  })
  .superRefine((data, ctx) => {
    if (data.um === "PZ" && data.baseQty != null && data.baseQty !== 1) {
      ctx.addIssue({
        path: ["baseQty"],
        code: z.ZodIssueCode.custom,
        message: "Per gli articoli PZ baseQty deve essere 1",
      });
    }
  });

export type CreateItemInput = z.infer<typeof CreateItemSchema>;
export type UpdateItemInput = z.infer<typeof UpdateItemSchema>;
