import { z } from "zod";

export const CreateMovementSchema = z
  .object({
    sku: z.string().min(1),
    type: z.enum(["IN", "OUT", "ADJUST", "INVENTORY"]),
    quantity: z.number(),
    reason: z
      .enum([
        "VENDITA",
        "RESO_CLIENTE",
        "SCARTO",
        "FURTO",
        "RETTIFICA",
        "INVENTARIO",
      ])
      .optional(),
    note: z.string().optional(),
    opsUnit: z.enum(["PZ", "PACK"]).optional(),
opsQty: z.number().optional(),

  })
  .superRefine((data, ctx) => {
  // OUT e ADJUST → reason obbligatoria
  if ((data.type === "OUT" || data.type === "ADJUST") && !data.reason) {
    ctx.addIssue({
      path: ["reason"],
      message: `${data.type} richiede una reason obbligatoria`,
      code: z.ZodIssueCode.custom,
    });
  }

  // INVENTORY → NON validare la reason qui (la impone il route)
})


export type CreateMovementInput = z.infer<
  typeof CreateMovementSchema
>;
