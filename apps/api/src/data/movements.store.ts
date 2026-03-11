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
    console.log("---- LOAD MOVEMENTS FROM DB ----");

    const res = await pool.query<DbMovementRow>(`
      SELECT id, sku, quantity, type, reason, date, note, documento, tenant_id
      FROM movements
      ORDER BY date ASC, id ASC
    `);

    const rows = res.rows.map(mapRowToMovement);

    console.log("MOVEMENTS LOADED =", rows.length);
    console.log("-------------------------------");

    return rows;
  } catch (err) {
    console.error("LOAD MOVEMENTS ERROR:", err);
    return defaultMovements;
  }
}

export async function insertMovement(movement: Movement): Promise<void> {
  try {
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

    console.log("✅ INSERT MOVEMENT OK:", movement.id);
  } catch (err) {
    console.error("INSERT MOVEMENT ERROR:", err);
    throw err;
  }
}

export async function insertManyMovements(
  movements: Movement[]
): Promise<void> {
  if (!movements.length) {
    console.log("insertManyMovements: nessun movimento da inserire");
    return;
  }

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
    console.log("✅ INSERT MANY MOVEMENTS OK:", movements.length);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("INSERT MANY MOVEMENTS ERROR:", err);
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteAllMovements(): Promise<void> {
  try {
    await pool.query(`DELETE FROM movements`);
    console.log("🧹 Tutti i movimenti eliminati");
  } catch (err) {
    console.error("DELETE ALL MOVEMENTS ERROR:", err);
    throw err;
  }
}
