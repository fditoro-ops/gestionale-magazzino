import type { Movement } from "../types/movement.js";
import { pool } from "../db.js";

console.log("=================================");
console.log("MOVEMENTS STORE = PostgreSQL");
console.log("DATABASE_URL PRESENT =", !!process.env.DATABASE_URL);
console.log("=================================");

type DbMovementRow = {
  id: string;
  sku: string;
  quantity: string | number;
  type: string;
  reason: string | null;
  date: string | Date;
  note: string | null;
  documento: string | null;
  tenant_id: string | null;
};

function mapRowToMovement(row: DbMovementRow): Movement {
  return {
    id: String(row.id),
    sku: String(row.sku),
    quantity: Number(row.quantity),
    type: row.type as Movement["type"],
    reason: (row.reason ?? undefined) as Movement["reason"],
    date: new Date(row.date).toISOString(),
    note: row.note ?? undefined,
    documento: row.documento ?? undefined,
    tenant_id: row.tenant_id ?? undefined,
  };
}

export async function loadMovements(
  defaultMovements: Movement[] = []
): Promise<Movement[]> {
  try {
    const res = await pool.query<DbMovementRow>(`
      SELECT id, sku, quantity, type, reason, date, note, documento, tenant_id
      FROM movements
      ORDER BY date ASC, id ASC
    `);

    return res.rows.map(mapRowToMovement);
  } catch (err) {
    console.error("LOAD MOVEMENTS ERROR:", err);
    return defaultMovements;
  }
}

export async function insertMovement(movement: Movement): Promise<void> {
  await pool.query(
    `
    INSERT INTO movements (
      id, sku, quantity, type, reason, date, note, documento, tenant_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (id) DO NOTHING
    `,
    [
      movement.id,
      movement.sku,
      movement.quantity,
      movement.type,
      movement.reason ?? null,
      movement.date,
      movement.note ?? null,
      movement.documento ?? null,
      movement.tenant_id ?? null,
    ]
  );
}

export async function insertManyMovements(
  movements: Movement[]
): Promise<void> {
  if (!movements.length) return;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const movement of movements) {
      await client.query(
        `
        INSERT INTO movements (
          id, sku, quantity, type, reason, date, note, documento, tenant_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (id) DO NOTHING
        `,
        [
          movement.id,
          movement.sku,
          movement.quantity,
          movement.type,
          movement.reason ?? null,
          movement.date,
          movement.note ?? null,
          movement.documento ?? null,
          movement.tenant_id ?? null,
        ]
      );
    }

    await client.query("COMMIT");
    console.log("✅ INSERT MANY MOVEMENTS =", movements.length);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("INSERT MANY MOVEMENTS ERROR:", err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Compatibilità legacy:
 * riscrive tutta la tabella con l'array passato.
 * Da NON usare nel normale flusso ordini/ricezioni.
 */
export async function saveMovements(movements: Movement[]): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM movements`);

    for (const movement of movements) {
      await client.query(
        `
        INSERT INTO movements (
          id, sku, quantity, type, reason, date, note, documento, tenant_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `,
        [
          movement.id,
          movement.sku,
          movement.quantity,
          movement.type,
          movement.reason ?? null,
          movement.date,
          movement.note ?? null,
          movement.documento ?? null,
          movement.tenant_id ?? null,
        ]
      );
    }

    await client.query("COMMIT");
    console.log("✅ SAVE MOVEMENTS TO DB =", movements.length);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("SAVE MOVEMENTS ERROR:", err);
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteAllMovements(): Promise<void> {
  await pool.query(`DELETE FROM movements`);
}
