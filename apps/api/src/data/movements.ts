import type { Movement } from "../types/movement.js";
import { loadMovements } from "./movements.store.js";

// 🔐 fonte unica dei dati
export const movements: Movement[] = loadMovements();
    