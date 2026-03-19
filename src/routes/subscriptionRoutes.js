/**
 * subscriptionRoutes.js
 */
import express from "express";
import {
  getPlans,
  createPlan,
  updatePlan,
  deletePlan,
  getMySubscription,
  getUsageSummary,
  getAllSubscriptions,
  assignPlan,
  purchasePlan,
  clearDeviceSessions,
} from "../controllers/subscriptionController.js";
import { protect, superAdminOnly } from "../middleware/auth.js";

const router = express.Router();

// ── Public ─────────────────────────────────────────────────────────────────────
router.get("/plans", getPlans);

// ── Company (Owner/Staff) ──────────────────────────────────────────────────────
router.get("/my",      protect, getMySubscription);   // full subscription + usage
router.get("/usage",   protect, getUsageSummary);     // ← NEW: live usage summary
router.post("/purchase", protect, purchasePlan);

// ── SuperAdmin only ────────────────────────────────────────────────────────────
router.get("/all",                    protect, superAdminOnly, getAllSubscriptions);
router.post("/assign",                protect, superAdminOnly, assignPlan);
router.delete("/sessions/:companyId", protect, superAdminOnly, clearDeviceSessions);

// ── Plan CRUD (SuperAdmin only) ────────────────────────────────────────────────
router.post("/plans",       protect, superAdminOnly, createPlan);
router.put("/plans/:id",    protect, superAdminOnly, updatePlan);
router.delete("/plans/:id", protect, superAdminOnly, deletePlan);

export default router;