import { Router } from "express";
import { getDashboardSummary } from "../services/dashboard.service.js";

const router = Router();

router.get("/summary", async (req, res) => {
  try {
    const tenantId = String(process.env.TENANT_ID || "IMP001");
    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;

    const data = await getDashboardSummary({
      tenantId,
      from,
      to,
    });

    res.json({
      ok: true,
      data,
    });
  } catch (err: any) {
    console.error("GET /dashboard/summary error:", err);
    res.status(500).json({
      ok: false,
      error: String(err?.message ?? err),
    });
  }
});

export default router;
