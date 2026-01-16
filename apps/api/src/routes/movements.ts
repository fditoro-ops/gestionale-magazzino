import { Router } from "express";
import { randomUUID } from "crypto";
import type { Movement } from "../types/movement.js";
import { movements } from "../data/movements.js";
import {
  CreateMovementSchema,
  type CreateMovementInput,
} from "../schemas/movement.schema.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json(movements);
});

router.post("/", (req, res) => {
  const parsed = CreateMovementSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation error",
      details: parsed.error.format(),
    });
  }

  const { sku, quantity, type, note } =
    parsed.data as CreateMovementInput;

  const movement: Movement = {
    id: randomUUID(),
    sku,
    quantity,
    type,
    date: new Date().toISOString(),
    note,
  };

  movements.push(movement);

  res.status(201).json(movement);
});

export default router;
