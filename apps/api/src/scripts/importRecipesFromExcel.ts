import path from "path";
import xlsx from "xlsx";
import { pool } from "../db.js";

type ItemRow = {
  sku: string;
  name: string;
  um: string | null;
};

type RecipeExcelRow = {
  productSku: string;
  productName: string;
  ingredientSku: string;
  ingredientName: string;
  quantity: number;
  um: string;
};

type MenuRow = {
  sku: string;
  description: string;
  sellingPrice: number | null;
};

type ValidationIssue = {
  level: "ERROR" | "WARN";
  code: string;
  message: string;
  rowNumber?: number;
  productSku?: string;
  ingredientSku?: string;
};

const TENANT_ID = process.env.TENANT_ID || "IMP001";
const FILE_PATH =
  process.env.RECIPES_XLSX_PATH || "/mnt/data/RICETTARIO 2.0.xlsx";
const APPLY = process.env.APPLY === "1";

function toStr(v: unknown): string {
  return String(v ?? "").trim();
}

function toSku(v: unknown): string {
  return toStr(v).toUpperCase();
}

function toUm(v: unknown): string {
  return toStr(v).toUpperCase();
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function readSheetRows(ws: xlsx.WorkSheet): any[] {
  return xlsx.utils.sheet_to_json(ws, {
    defval: "",
    raw: true,
  });
}

async function loadItemsMap(): Promise<Map<string, ItemRow>> {
  const res = await pool.query(
    `
    SELECT sku, name, um
    FROM "Item"
    `
  );

  const map = new Map<string, ItemRow>();
  for (const row of res.rows) {
    const sku = toSku(row.sku);
    map.set(sku, {
      sku,
      name: toStr(row.name),
      um: row.um ? toUm(row.um) : null,
    });
  }
  return map;
}

function parseMenuSheet(rows: any[]): Map<string, MenuRow> {
  const out = new Map<string, MenuRow>();

  for (const row of rows) {
    const sku = toSku(row["ID"]);
    if (!sku) continue;

    out.set(sku, {
      sku,
      description: toStr(row["Descrizione"]),
      sellingPrice:
        row["Prezzo Base"] === "" || row["Prezzo Base"] == null
          ? null
          : toNum(row["Prezzo Base"]),
    });
  }

  return out;
}

function parseRicetteSheet(rows: any[]): RecipeExcelRow[] {
  const out: RecipeExcelRow[] = [];

  for (const row of rows) {
    const productSku = toSku(row["SKU_PRODOTTO"]);
    const productName = toStr(row["NOME_PRODOTTO"]);
    const ingredientSku = toSku(row["SKU_INGREDIENTE"]);
    const ingredientName = toStr(row["INGREDIENTE"]);
    const quantity = toNum(row["QTA"]);
    const um = toUm(row["UM"]);

    if (!productSku || !ingredientSku) continue;
    if (!quantity || quantity <= 0) continue;

    out.push({
      productSku,
      productName,
      ingredientSku,
      ingredientName,
      quantity,
      um,
    });
  }

  return out;
}

async function main() {
  console.log("📘 File:", FILE_PATH);
  console.log("🏢 Tenant:", TENANT_ID);
  console.log("🧪 Mode:", APPLY ? "APPLY" : "DRY RUN");

  const workbook = xlsx.readFile(path.resolve(FILE_PATH));

  const ricetteWs = workbook.Sheets["RICETTE"];
  const menuWs = workbook.Sheets["MENU"];

  if (!ricetteWs) {
    throw new Error("Foglio 'RICETTE' non trovato");
  }
  if (!menuWs) {
    throw new Error("Foglio 'MENU' non trovato");
  }

  const ricetteRaw = readSheetRows(ricetteWs);
  const menuRaw = readSheetRows(menuWs);

  const recipeRows = parseRicetteSheet(ricetteRaw);
  const menuMap = parseMenuSheet(menuRaw);
  const itemsMap = await loadItemsMap();

  const issues: ValidationIssue[] = [];
  const grouped = new Map<string, RecipeExcelRow[]>();

  recipeRows.forEach((row, idx) => {
    const rowNumber = idx + 2;

    const productItem = itemsMap.get(row.productSku);
    const ingredientItem = itemsMap.get(row.ingredientSku);

    if (!productItem) {
      issues.push({
        level: "ERROR",
        code: "PRODUCT_SKU_NOT_FOUND",
        message: `SKU prodotto non trovato in Item: ${row.productSku}`,
        rowNumber,
        productSku: row.productSku,
      });
    }

    if (!ingredientItem) {
      issues.push({
        level: "ERROR",
        code: "INGREDIENT_SKU_NOT_FOUND",
        message: `SKU ingrediente non trovato in Item: ${row.ingredientSku}`,
        rowNumber,
        productSku: row.productSku,
        ingredientSku: row.ingredientSku,
      });
    }

    if (ingredientItem?.um && row.um && ingredientItem.um !== row.um) {
      issues.push({
        level: "WARN",
        code: "INGREDIENT_UM_MISMATCH",
        message: `UM ingrediente diversa: Excel=${row.um}, Item=${ingredientItem.um} per ${row.ingredientSku}`,
        rowNumber,
        productSku: row.productSku,
        ingredientSku: row.ingredientSku,
      });
    }

    if (!menuMap.has(row.productSku)) {
      issues.push({
        level: "WARN",
        code: "MENU_PRICE_NOT_FOUND",
        message: `Prezzo base non trovato nel foglio MENU per ${row.productSku}`,
        rowNumber,
        productSku: row.productSku,
      });
    }

    if (!grouped.has(row.productSku)) {
      grouped.set(row.productSku, []);
    }
    grouped.get(row.productSku)!.push(row);
  });

  const errorCount = issues.filter((i) => i.level === "ERROR").length;
  const warnCount = issues.filter((i) => i.level === "WARN").length;

  console.log("─".repeat(70));
  console.log("📊 SUMMARY");
  console.log("Righe ricette lette:", recipeRows.length);
  console.log("Ricette distinte:", grouped.size);
  console.log("Item in anagrafica:", itemsMap.size);
  console.log("Warning:", warnCount);
  console.log("Errori:", errorCount);

  if (issues.length) {
    console.log("─".repeat(70));
    console.log("🔎 PRIME ANOMALIE");
    for (const issue of issues.slice(0, 30)) {
      console.log(
        `[${issue.level}] ${issue.code} | riga ${issue.rowNumber ?? "-"} | ${issue.message}`
      );
    }
  }

  if (!APPLY) {
    console.log("─".repeat(70));
    console.log("🧪 DRY RUN completato. Nessuna scrittura eseguita.");
    return;
  }

  if (errorCount > 0) {
    throw new Error(
      `Import bloccato: presenti ${errorCount} errori di validazione`
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let recipesUpserted = 0;
    let ingredientsInserted = 0;

    for (const [productSku, rows] of grouped.entries()) {
      const first = rows[0];
      const menu = menuMap.get(productSku);
      const item = itemsMap.get(productSku);

      const recipeName =
        toStr(menu?.description) ||
        toStr(first.productName) ||
        toStr(item?.name) ||
        productSku;

      const sellingPrice = menu?.sellingPrice ?? null;

      const recipeRes = await client.query(
        `
        INSERT INTO recipes (
          id,
          tenant_id,
          product_sku,
          name,
          status,
          selling_price,
          created_at,
          updated_at
        )
        VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          'ACTIVE',
          $4,
          NOW(),
          NOW()
        )
        ON CONFLICT (tenant_id, product_sku)
        DO UPDATE SET
          name = EXCLUDED.name,
          selling_price = EXCLUDED.selling_price,
          updated_at = NOW()
        RETURNING id
        `,
        [TENANT_ID, productSku, recipeName, sellingPrice]
      );

      const recipeId = recipeRes.rows[0]?.id;
      recipesUpserted++;

      await client.query(
        `
        DELETE FROM recipe_ingredients
        WHERE recipe_id = $1
        `,
        [recipeId]
      );

      let sortOrder = 0;
      for (const row of rows) {
        const ingredientItem = itemsMap.get(row.ingredientSku);
        const finalUm = ingredientItem?.um || row.um;

        await client.query(
          `
          INSERT INTO recipe_ingredients (
            id,
            recipe_id,
            ingredient_sku,
            ingredient_name_snapshot,
            quantity,
            um,
            sort_order,
            is_optional,
            waste_pct,
            notes,
            created_at,
            updated_at
          )
          VALUES (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            false,
            null,
            null,
            NOW(),
            NOW()
          )
          `,
          [
            recipeId,
            row.ingredientSku,
            row.ingredientName || ingredientItem?.name || null,
            row.quantity,
            finalUm,
            sortOrder++,
          ]
        );

        ingredientsInserted++;
      }
    }

    await client.query("COMMIT");

    console.log("─".repeat(70));
    console.log("✅ IMPORT COMPLETATO");
    console.log("Ricette create/aggiornate:", recipesUpserted);
    console.log("Ingredienti inseriti:", ingredientsInserted);
    console.log("Warning:", warnCount);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

main()
  .then(() => {
    console.log("🏁 Fine script");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Errore import:", err);
    process.exit(1);
  });
