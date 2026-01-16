import { z } from "zod";

export const MovementTypeEnum = z.enum([
  "IN",
  "OUT",
  "ADJUST",
  "INVENTORY",
]);

export const CreateMovementSchema = z.object({
  sku: z.string().min(1, "SKU obbligatorio"),
  quantity: z.number().int().nonnegative(),
  type: MovementTypeEnum,
  note: z.string().optional(),
});

export type CreateMovementInput = z.infer<
  typeof CreateMovementSchema
>;
