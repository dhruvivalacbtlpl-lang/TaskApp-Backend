// routes/documentRoutes.js
import express from "express";
import {
  getDocuments,
  getDocumentById,
  getAccessRequests,
  createDocument,
  updateDocument,
  deleteDocument,
  requestAccess,
  respondToAccessRequest,
} from "../controllers/documentController.js";

const router = express.Router();

// ── ACCESS REQUESTS — defined BEFORE /:id to avoid route collision ────────────
router.get("/access-requests",                getAccessRequests);
router.put("/access-requests/:requestId",     respondToAccessRequest);

// ── DOCUMENTS ─────────────────────────────────────────────────────────────────
router.get("/",     getDocuments);
router.get("/:id",  getDocumentById);
router.post("/",    createDocument);
router.put("/:id",  updateDocument);
router.delete("/:id", deleteDocument);

// ── ACCESS REQUEST (by a non-admin user) ──────────────────────────────────────
router.post("/:id/request-access", requestAccess);

export default router;