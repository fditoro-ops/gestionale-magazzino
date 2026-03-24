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

function round2(value: number) {
  return Math.round(value * 100) / 100;
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

    const electronic_total =
      data.electronic_total ??
      round2(
        (data.pos1_declared ?? 0) +
          (data.pos2_declared ?? 0) +
          (data.satispay_declared ?? 0) +
          (data.other_declared ?? 0)
      );

    const comparable_total = round2(
      electronic_total + (data.cash_declared ?? 0)
    );

    const receipt_delta =
      data.receipt_delta ??
      (data.receipt_total != null
        ? round2(data.receipt_total - comparable_total)
        : null);

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
      receipt_total: data.receipt_total ?? null,

      cash_declared: data.cash_declared ?? 0,
      card_declared: data.card_declared ?? 0,
      satispay_declared: data.satispay_declared ?? 0,
      other_declared: data.other_declared ?? 0,

      pos1_declared: data.pos1_declared ?? 0,
      pos2_declared: data.pos2_declared ?? 0,
      qromo_declared: data.qromo_declared ?? 0,

      electronic_total,
      declared_total: totals.declared_total,
      delta: totals.delta,
      receipt_delta,

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
      receipt_total:
        patch.receipt_total !== undefined
          ? patch.receipt_total
          : existing.receipt_total,

      cash_declared: patch.cash_declared ?? existing.cash_declared,
      card_declared: patch.card_declared ?? existing.card_declared,
      satispay_declared:
        patch.satispay_declared ?? existing.satispay_declared,
      other_declared: patch.other_declared ?? existing.other_declared,

      pos1_declared: patch.pos1_declared ?? existing.pos1_declared,
      pos2_declared: patch.pos2_declared ?? existing.pos2_declared,
      qromo_declared: patch.qromo_declared ?? existing.qromo_declared,

      notes: patch.notes ?? existing.notes,
      receipt_image_url: existing.receipt_image_url,
    };

    const electronic_total =
      patch.electronic_total ??
      existing.electronic_total ??
      round2(
        merged.pos1_declared +
          merged.pos2_declared +
          merged.satispay_declared +
          merged.other_declared
      );

    const comparable_total = round2(
      electronic_total + merged.cash_declared
    );

    const receipt_delta =
      patch.receipt_delta !== undefined
        ? patch.receipt_delta
        : merged.receipt_total != null
          ? round2(merged.receipt_total - comparable_total)
          : null;

    const totals = computeCashClosureTotals({
      theoretical_base: merged.theoretical_base,
      cash_declared: merged.cash_declared,
      card_declared: merged.card_declared,
      satispay_declared: merged.satispay_declared,
      other_declared: merged.other_declared,
    });

    const alerts = buildCashClosureAlerts({
      theoretical_base: merged.theoretical_base,
      cash_declared: merged.cash_declared,
      card_declared: merged.card_declared,
      satispay_declared: merged.satispay_declared,
      other_declared: merged.other_declared,
      receipt_image_url: existing.receipt_image_url,
    });

    const updated = await updateCashClosureDb(tenant_id, req.params.id, {
      business_date: merged.business_date,
      operator_id: merged.operator_id,
      operator_name: merged.operator_name,

      theoretical_base: merged.theoretical_base,
      receipt_total: merged.receipt_total,

      cash_declared: merged.cash_declared,
      card_declared: merged.card_declared,
      satispay_declared: merged.satispay_declared,
      other_declared: merged.other_declared,

      pos1_declared: merged.pos1_declared,
      pos2_declared: merged.pos2_declared,
      qromo_declared: merged.qromo_declared,

      electronic_total,
      declared_total: totals.declared_total,
      delta: totals.delta,
      receipt_delta,

      notes: merged.notes,
      alert_flags: alerts,
    });

    res.json(updated);
  } catch (error: any) {
    console.error("PUT /cash-closures/:id error", error);
    res.status(500).json({ ok: false, error: "Errore interno" });
  }
});

router.post("/:id/receipt", upload.single("receipt"), async (req: any, res) => {
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

    const electronic_total =
      existing.electronic_total ??
      round2(
        existing.pos1_declared +
          existing.pos2_declared +
          existing.satispay_declared +
          existing.other_declared
      );

    const comparable_total = round2(
      electronic_total + existing.cash_declared
    );

    const receipt_delta =
      existing.receipt_total != null
        ? round2(existing.receipt_total - comparable_total)
        : null;

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
      electronic_total,
      declared_total: totals.declared_total,
      delta: totals.delta,
      receipt_delta,
      alert_flags: alerts,
      status: "CLOSED",
      closed_at: new Date().toISOString(),
    });

    if (!closed) {
      return res.status(500).json({
        ok: false,
        error: "Errore chiusura record",
      });
    }

    try {
      const mailResult = await sendCashClosureEmail(closed);

      if (mailResult?.ok) {
        closed = await updateCashClosureDb(tenant_id, req.params.id, {
          email_sent: true,
          email_sent_at: new Date().toISOString(),
          email_error: null,
        });
      } else {
        closed = await updateCashClosureDb(tenant_id, req.params.id, {
          email_sent: false,
          email_error: mailResult?.error || "EMAIL_SEND_FAILED",
        });
      }
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
