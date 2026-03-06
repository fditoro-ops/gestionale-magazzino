import fs from "fs";
import path from "path";
import type { Movement } from "../types/movement.js";

const FILE = path.resolve(process.cwd(), "apps/api/data/movements.json");

console.log("MOVEMENTS_STORE FILE =", FILE, "CWD =", process.cwd());

export function loadMovements(defaultMovements: Movement[] = []): Movement[] {
  try {
    if (!fs.existsSync(FILE)) {
      console.log("LOAD MOVEMENTS: file non esiste, uso default");
      return defaultMovements;
    }

    const raw = fs.readFileSync(FILE, "utf-8");
    const data = JSON.parse(raw);

    const rows = Array.isArray(data) ? data : defaultMovements;
    console.log("LOAD MOVEMENTS COUNT =", Array.isArray(rows) ? rows.length : 0);

    return rows;
  } catch (err) {
    console.error("LOAD MOVEMENTS ERROR:", err);
    return defaultMovements;
  }
}

export function saveMovements(movements: Movement[]) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(movements, null, 2), "utf-8");
  console.log("SAVE MOVEMENTS COUNT =", movements.length, "FILE =", FILE);
}
