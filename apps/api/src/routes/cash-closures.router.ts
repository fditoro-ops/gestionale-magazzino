import { Router } from "express";
import multer from "multer";

import {
  CreateCashClosureSchema,
  UpdateCashClosureSchema,
  ListCashClosuresQuerySchema,
} from "../schemas/cash-closure.schema.js";

import {
  listCashClosuresDb,
  getCashClosureByIdDb,
  createCashClosureDb,
  updateCashClosureDb,
} from "../data/cash-closures.db.js";

import {
  computeCashClosureTotals,
  buildCashClosureAlerts,
} from "../services/cash-closures.service.js";

import { sendCashClosureEmail } from "../services/cash-closures.email.js";
import { uploadCashClosureReceipt } from "../services/cash-closures.upload.js";

const router = Router();
const upload = multer({ dest: "uploads/" });

function getTenantId(req: any) {
  return req.user?.tenant_id || req.headers["x-tenant-id"] || "IMP001";
}

function getUserInfo(req: any) {
  return {
    userId: req.user?.id || null,
    userName: req.user?.name || req.user?.email || null,
    role: req.user?.role || "user",
  };
}

router.get("/", async (req, res) => {
  try {
    const tenant_id = String(getTenantId(req));
    const parsed = ListCashClosuresQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "Query non valida",
        details: parsed.error.flatten(),
      });
    }

    const rows = await listCashClosuresDb({
      tenant_id,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      status: parsed.data.status,
      operatorId: parsed.data.operatorId,
    });

    res.json(rows);
  } catch (error: any) {
    console.error("GET /cash-closures error", error);
    res.status(500).json({ ok: false, error: "Errore interno" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const tenant_id = String(getTenantId(req));
    const row = await getCashClosureByIdDb(tenant_id, req.params.id);

    if (!row) {
      return res.status(404).json({ ok: false, error: "Chiusura non trovata" });
    }

    res.json(row);
  } catch (error: any) {
    console.error("GET /cash-closures/:id error", error);
    res.status(500).json({ ok: false, error: "Errore interno" });
  }
});

router.post("/", async (req, res) => {
  try {
    const tenant_id = String(getTenantId(req));
    const parsed = CreateCashClosureSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "Payload non valido",
        details: parsed.error.flatten(),
      });
    }

    const data = parsed.data;

    const totals = computeCashClosureTotals({
      theoretical_base: data.theoretical_base,
      cash_declared: data.cash_declared,
      card_declared: data.card_declared,
      satispay_declared: data.satispay_declared,
      other_declared: data.other_declared,
    });

    const alerts = buildCashClosureAlerts({
      theoretical_base: data.theoretical_base,
      cash_declared: data.cash_declared,
      card_declared: data.card_declared,
      satispay_declared: data.satispay_declared,
      other_declared: data.other_declared,
      receipt_image_url: null,
    });

    const created = await createCashClosureDb({
      tenant_id,
      business_date: data.business_date,
      operator_id: data.operator_id ?? null,
      operator_name: data.operator_name ?? null,
      theoretical_base: data.theoretical_base,
      cash_declared: data.cash_declared ?? 0,
      card_declared: data.card_declared ?? 0,
      satispay_declared: data.satispay_declared ?? 0,
      other_declared: data.other_declared ?? 0,
      declared_total: totals.declared_total,
      delta: totals.delta,
      notes: data.notes ?? null,
      alert_flags: alerts,
    });

    res.status(201).json(created);
  } catch (error: any) {
    console.error("POST /cash-closures error", error);
    res.status(500).json({ ok: false, error: "Errore interno" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const tenant_id = String(getTenantId(req));
    const parsed = UpdateCashClosureSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "Payload non valido",
        details: parsed.error.flatten(),
      });
    }

    const existing = await getCashClosureByIdDb(tenant_id, req.params.id);
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Chiusura non trovata" });
    }

    if (existing.status !== "DRAFT") {
      return res.status(409).json({
        ok: false,
        error: "Solo le bozze possono essere modificate",
      });
    }

    const patch = parsed.data;

    const merged = {
      business_date: patch.business_date ?? existing.business_date,
      operator_id: patch.operator_id ?? existing.operator_id,
      operator_name: patch.operator_name ?? existing.operator_name,
      theoretical_base: patch.theoretical_base ?? existing.theoretical_base,
      cash_declared: patch.cash_declared ?? existing.cash_declared,
      card_declared: patch.card_declared ?? existing.card_declared,
      satispay_declared: patch.satispay_declared ?? existing.satispay_declared,
      other_declared: patch.other_declared ?? existing.other_declared,
      notes: patch.notes ?? existing.notes,
      receipt_image_url: existing.receipt_image_url,
    };

    const totals = computeCashClosureTotals(merged);
    const alerts = buildCashClosureAlerts({
      ...merged,
      ...totals,
      receipt_image_url: existing.receipt_image_url,
    });

    const updated = await updateCashClosureDb(tenant_id, req.params.id, {
      business_date: merged.business_date,
      operator_id: merged.operator_id,
      operator_name: merged.operator_name,
      theoretical_base: merged.theoretical_base,
      cash_declared: merged.cash_declared,
      card_declared: merged.card_declared,
      satispay_declared: merged.satispay_declared,
      other_declared: merged.other_declared,
      notes: merged.notes,
      declared_total: totals.declared_total,
      delta: totals.delta,
      alert_flags: alerts,
    });

    res.json(updated);
  } catch (error: any) {
    console.error("PUT /cash-closures/:id error", error);
    res.status(500).json({ ok: false, error: "Errore interno" });
  }
});

router.post("/:id/receipt", upload.single("receipt"), async (req, res) => {
  try {
    const tenant_id = String(getTenantId(req));

    const existing = await getCashClosureByIdDb(tenant_id, req.params.id);
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Chiusura non trovata" });
    }

    if (existing.status !== "DRAFT") {
      return res.status(409).json({
        ok: false,
        error: "Upload consentito solo su bozze",
      });
    }

    if (!req.file) {
      return res.status(400).json({ ok: false, error: "File mancante" });
    }

    const uploaded = await uploadCashClosureReceipt({ file: req.file });

    const alerts = buildCashClosureAlerts({
      theoretical_base: existing.theoretical_base,
      cash_declared: existing.cash_declared,
      card_declared: existing.card_declared,
      satispay_declared: existing.satispay_declared,
      other_declared: existing.other_declared,
      receipt_image_url: uploaded.receipt_image_url,
    });

    const updated = await updateCashClosureDb(tenant_id, req.params.id, {
      receipt_image_url: uploaded.receipt_image_url,
      receipt_image_name: uploaded.receipt_image_name,
      alert_flags: alerts,
    });

    res.json(updated);
  } catch (error: any) {
    console.error("POST /cash-closures/:id/receipt error", error);
    res.status(500).json({ ok: false, error: "Errore interno" });
  }
});

router.post("/:id/close", async (req, res) => {
  try {
    const tenant_id = String(getTenantId(req));

    const existing = await getCashClosureByIdDb(tenant_id, req.params.id);
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Chiusura non trovata" });
    }

    if (existing.status !== "DRAFT") {
      return res.status(409).json({
        ok: false,
        error: "Solo una bozza può essere chiusa",
      });
    }

    const totals = computeCashClosureTotals({
      theoretical_base: existing.theoretical_base,
      cash_declared: existing.cash_declared,
      card_declared: existing.card_declared,
      satispay_declared: existing.satispay_declared,
      other_declared: existing.other_declared,
      receipt_image_url: existing.receipt_image_url,
    });

    const alerts = buildCashClosureAlerts({
      theoretical_base: existing.theoretical_base,
      cash_declared: existing.cash_declared,
      card_declared: existing.card_declared,
      satispay_declared: existing.satispay_declared,
      other_declared: existing.other_declared,
      receipt_image_url: existing.receipt_image_url,
    });

    let closed = await updateCashClosureDb(tenant_id, req.params.id, {
      declared_total: totals.declared_total,
      delta: totals.delta,
      alert_flags: alerts,
      status: "CLOSED",
      closed_at: new Date().toISOString(),
    });

    if (!closed) {
      return res.status(500).json({ ok: false, error: "Errore chiusura record" });
    }

    try {
      await sendCashClosureEmail({ closure: closed });

      closed = await updateCashClosureDb(tenant_id, req.params.id, {
        email_sent: true,
        email_sent_at: new Date().toISOString(),
        email_error: null,
      });
    } catch (mailError: any) {
      console.error("Cash closure email error", mailError);

      closed = await updateCashClosureDb(tenant_id, req.params.id, {
        email_sent: false,
        email_error: mailError?.message || "EMAIL_SEND_FAILED",
      });
    }

    res.json(closed);
  } catch (error: any) {
    console.error("POST /cash-closures/:id/close error", error);
    res.status(500).json({ ok: false, error: "Errore interno" });
  }
});

router.post("/:id/verify", async (req, res) => {
  try {
    const tenant_id = String(getTenantId(req));
    const { userId, role } = getUserInfo(req);

    if (role !== "admin") {
      return res.status(403).json({ ok: false, error: "Non autorizzato" });
    }

    const existing = await getCashClosureByIdDb(tenant_id, req.params.id);
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Chiusura non trovata" });
    }

    if (existing.status !== "CLOSED") {
      return res.status(409).json({
        ok: false,
        error: "Solo una chiusura CLOSED può essere verificata",
      });
    }

    const updated = await updateCashClosureDb(tenant_id, req.params.id, {
      status: "VERIFIED",
      verified_at: new Date().toISOString(),
      verified_by: userId,
    });

    res.json(updated);
  } catch (error: any) {
    console.error("POST /cash-closures/:id/verify error", error);
    res.status(500).json({ ok: false, error: "Errore interno" });
  }
});

router.post("/:id/cancel", async (req, res) => {
  try {
    const tenant_id = String(getTenantId(req));
    const { role } = getUserInfo(req);

    if (role !== "admin") {
      return res.status(403).json({ ok: false, error: "Non autorizzato" });
    }

    const existing = await getCashClosureByIdDb(tenant_id, req.params.id);
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Chiusura non trovata" });
    }

    const updated = await updateCashClosureDb(tenant_id, req.params.id, {
      status: "CANCELLED",
    });

    res.json(updated);
  } catch (error: any) {
    console.error("POST /cash-closures/:id/cancel error", error);
    res.status(500).json({ ok: false, error: "Errore interno" });
  }
});

export default router;
