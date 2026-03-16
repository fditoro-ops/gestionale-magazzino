import { randomUUID } from "crypto";
import { pool } from "../db.js";

export type Supplier = string;
export type OrderStatus =
  | "DRAFT"
  | "SENT"
  | "PARTIAL"
  | "RECEIVED"
  | "CANCELLED";

export type OrderLine = {
  sku: string;
  qtyOrderedConf: number;
  qtyReceivedConf: number;
};

export type Order = {
  orderId: string;
  supplier: Supplier;
  status: OrderStatus;
  createdAt: string;
  sentAt?: string | null;
  receivedAt?: string | null;
  notes?: string | null;
  lines: OrderLine[];
};

function mapOrderRows(rows: any[], lineRows: any[]): Order[] {
  return rows.map((o) => ({
    orderId: o.order_id,
    supplier: o.supplier,
    status: o.status,
    createdAt: o.created_at,
    sentAt: o.sent_at,
    receivedAt: o.received_at,
    notes: o.notes,
    lines: lineRows
      .filter((l) => l.order_id === o.order_id)
      .map((l) => ({
        sku: l.sku,
        qtyOrderedConf: Number(l.qty_ordered_conf ?? 0),
        qtyReceivedConf: Number(l.qty_received_conf ?? 0),
      })),
  }));
}

export async function listOrders(): Promise<Order[]> {
  const ordersRes = await pool.query(`
    SELECT order_id, supplier, status, created_at, sent_at, received_at, notes
    FROM orders
    ORDER BY created_at ASC, order_id ASC
  `);

  const linesRes = await pool.query(`
    SELECT id, order_id, sku, qty_ordered_conf, qty_received_conf
    FROM order_lines
    ORDER BY order_id ASC, id ASC
  `);

  return mapOrderRows(ordersRes.rows, linesRes.rows);
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  const ordersRes = await pool.query(
    `
    SELECT order_id, supplier, status, created_at, sent_at, received_at, notes
    FROM orders
    WHERE order_id = $1
    `,
    [orderId]
  );

  if (!ordersRes.rows.length) return null;

  const linesRes = await pool.query(
    `
    SELECT id, order_id, sku, qty_ordered_conf, qty_received_conf
    FROM order_lines
    WHERE order_id = $1
    ORDER BY id ASC
    `,
    [orderId]
  );

  return mapOrderRows(ordersRes.rows, linesRes.rows)[0] ?? null;
}

export async function createOrderDb(input: {
  orderId: string;
  supplier: string;
  status: string;
  createdAt: string;
  sentAt?: string | null;
  receivedAt?: string | null;
  notes?: string | null;
  lines: Array<{
    sku: string;
    qtyOrderedConf: number;
    qtyReceivedConf: number;
  }>;
}): Promise<Order> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO orders (
        order_id, supplier, status, created_at, sent_at, received_at, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        input.orderId,
        input.supplier,
        input.status,
        input.createdAt,
        input.sentAt ?? null,
        input.receivedAt ?? null,
        input.notes ?? null,
      ]
    );

    for (const line of input.lines) {
      await client.query(
        `
        INSERT INTO order_lines (
          id, order_id, sku, qty_ordered_conf, qty_received_conf
        )
        VALUES ($1, $2, $3, $4, $5)
        `,
        [
          randomUUID(),
          input.orderId,
          line.sku,
          line.qtyOrderedConf,
          line.qtyReceivedConf,
        ]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const order = await getOrderById(input.orderId);
  if (!order) throw new Error("Ordine appena creato non trovato");

  return order;
}

export async function updateOrderDb(order: Order): Promise<Order> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      UPDATE orders
      SET supplier = $2,
          status = $3,
          created_at = $4,
          sent_at = $5,
          received_at = $6,
          notes = $7
      WHERE order_id = $1
      `,
      [
        order.orderId,
        order.supplier,
        order.status,
        order.createdAt,
        order.sentAt ?? null,
        order.receivedAt ?? null,
        order.notes ?? null,
      ]
    );

    await client.query(`DELETE FROM order_lines WHERE order_id = $1`, [
      order.orderId,
    ]);

    for (const line of order.lines) {
      await client.query(
        `
        INSERT INTO order_lines (
          id, order_id, sku, qty_ordered_conf, qty_received_conf
        )
        VALUES ($1, $2, $3, $4, $5)
        `,
        [
          randomUUID(),
          order.orderId,
          line.sku,
          line.qtyOrderedConf,
          line.qtyReceivedConf,
        ]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const updated = await getOrderById(order.orderId);
  if (!updated) throw new Error("Ordine aggiornato non trovato");

  return updated;
}

export async function deleteOrderDb(orderId: string): Promise<void> {
  await pool.query(`DELETE FROM orders WHERE order_id = $1`, [orderId]);
}
