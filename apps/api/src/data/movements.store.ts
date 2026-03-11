import fs from "fs";
import path from "path";
import type { Movement } from "../types/movement.js";

// Percorso file movimenti
const FILE = path.resolve(process.cwd(), "apps/api/data/movements.json");

// Debug iniziale all'avvio server
console.log("=================================");
console.log("MOVEMENTS STORE INIT");
console.log("CWD =", process.cwd());
console.log("MOVEMENTS FILE PATH =", FILE);
console.log("FILE EXISTS =", fs.existsSync(FILE));
console.log("=================================");

export function loadMovements(defaultMovements: Movement[] = []): Movement[] {
  try {
    console.log("---- LOAD MOVEMENTS ----");
    console.log("FILE PATH =", FILE);

    if (!fs.existsSync(FILE)) {
      console.log("FILE NON ESISTE -> ritorno default");
      return defaultMovements;
    }

    const stats = fs.statSync(FILE);
    console.log("FILE SIZE =", stats.size, "bytes");

    const raw = fs.readFileSync(FILE, "utf-8");

    if (!raw || raw.trim() === "") {
      console.log("FILE VUOTO");
      return defaultMovements;
    }

    const data = JSON.parse(raw);

    const rows = Array.isArray(data) ? data : defaultMovements;

    console.log("MOVEMENTS LOADED =", rows.length);
    console.log("------------------------");

    return rows;
  } catch (err) {
    console.error("LOAD MOVEMENTS ERROR:", err);
    return defaultMovements;
  }
}

export function saveMovements(movements: Movement[]) {
  try {
    console.log("**** SAVE MOVEMENTS ****");
    console.log("FILE PATH =", FILE);
    console.log("MOVEMENTS TO SAVE =", movements.length);

    const dir = path.dirname(FILE);
    console.log("DIR =", dir);

    fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(FILE, JSON.stringify(movements, null, 2), "utf-8");

    const stats = fs.statSync(FILE);

    console.log("SAVE OK");
    console.log("FILE SIZE AFTER SAVE =", stats.size, "bytes");
    console.log("***********************");
  } catch (err) {
    console.error("SAVE MOVEMENTS ERROR:", err);
  }
}
