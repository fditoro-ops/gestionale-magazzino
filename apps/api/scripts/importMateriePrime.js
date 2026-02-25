// scripts/importMateriePrime.js
import fs from "fs";
import path from "path";

const INPUT = path.resolve("./anagrafica_core.json");
const OUT = path.resolve("./data/items.json");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}
function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

const src = readJson(INPUT);
if (!Array.isArray(src)) {
  console.error("❌ anagrafica_core.json non è un array");
  process.exit(1);
}

const hasTipo = src.some((x) => typeof x?.tipoArticolo === "string" && x.tipoArticolo.trim());
if (!hasTipo) {
  console.log("⚠️ Nel JSON non esiste 'tipoArticolo'/'tipoProdotto'.");
  console.log("➡️ Rigenera il file da GAS includendo quel campo, altrimenti non posso filtrare 'MATERIA PRIMA'.");
  console.log("✅ Importate 0 MATERIE PRIME (scelta sicura).");
  process.exit(0);
}

const materie = src.filter(
  (x) => String(x.tipoArticolo || "").toUpperCase().trim() === "MATERIA PRIMA"
);

// qui puoi anche normalizzare/convertire campi se serve
writeJson(OUT, materie);

console.log(`✅ Importate ${materie.length} MATERIE PRIME in data/items.json`);
