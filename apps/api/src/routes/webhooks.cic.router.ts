import { Router } from "express";
import { processCicWebhook } from "../services/cic/cicWebhook.service.js";

const router = Router();

// health check CIC
router.get("/", (_req, res) => res.status(200).send("OK"));
router.head("/", (_req, res) => res.status(200).end());
router.options("/", (_req, res) => res.status(200).end());

// webhook vero
router.post("/", processCicWebhook);

export default router;
