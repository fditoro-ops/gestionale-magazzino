import { z } from "zod";

export const CreateMovementSchema = z
  .object({
    sku: z.string().min(1).transform((s) => s.toUpperCase().trim()),

    type: z.enum(["IN", "OUT", "ADJUST", "INVENTORY"]),

    quantity: z.coerce.number().positive(),

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

    note: z.string().trim().optional(),

    opsUnit: z.enum(["PZ", "PACK"]).optional(),
    opsQty: z.coerce.number().positive().optional(),
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

    // INVENTORY → non validiamo la reason qui, la impone il router

    // opsUnit e opsQty devono viaggiare insieme
    const hasOpsUnit = data.opsUnit !== undefined;
    const hasOpsQty = data.opsQty !== undefined;

    if (hasOpsUnit !== hasOpsQty) {
      ctx.addIssue({
        path: hasOpsUnit ? ["opsQty"] : ["opsUnit"],
        message: "opsUnit e opsQty devono essere valorizzati entrambi",
        code: z.ZodIssueCode.custom,
      });
    }
  });

export type CreateMovementInput = z.infer<typeof CreateMovementSchema>;
