import fs from "fs";
import path from "path";
import type { Movement } from "../types/movement.js";

const FILE = path.resolve(process.cwd(), "apps/api/data/movements.json");

export function loadMovements(defaultMovements: Movement[] = []): Movement[] {
  try {
    if (!fs.existsSync(FILE)) return defaultMovements;

    const raw = fs.readFileSync(FILE, "utf-8");
    const data = JSON.parse(raw);

    return Array.isArray(data) ? data : defaultMovements;
  } catch {
    return defaultMovements;
  }
}

export function saveMovements(movements: Movement[]) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(movements, null, 2), "utf-8");
}
