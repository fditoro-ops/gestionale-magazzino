import fs from "fs";
import path from "path";
import type { Movement } from "../types/movement.js";

const FILE = path.resolve("data/movements.json");

export function loadMovements(): Movement[] {
  if (!fs.existsSync(FILE)) return [];
  return JSON.parse(fs.readFileSync(FILE, "utf-8"));
}

export function saveMovements(movements: Movement[]) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(movements, null, 2));
}
