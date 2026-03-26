import express, { Router } from "express";
import { processCicWebhook } from "../services/cicWebhook.service.js";

const router = Router();

router.get("/", (_req, res) => res.status(200).send("OK"));
router.head("/", (_req, res) => res.status(200).end());
router.options("/", (_req, res) => res.status(200).end());

router.post("/", express.raw({ type: "*/*" }), processCicWebhook);

export default router;
