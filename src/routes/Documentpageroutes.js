import express from "express";
import { protect } from "../middleware/auth.js";
import { logAudit } from "../utils/logAudit.js";
import {
  getDocumentpages,
  getDocumentpageById,
  createDocumentPage,
  updateDocumentPage,
  bulkSavePages,
  deleteDocumentPage,
  updateDocumentHeaderFooter,
  superadminGetAll,
} from "../controllers/Documentpagecontroller.js";

const router = express.Router();

// ── Superadmin: see everything ────────────────────────────────────────────────
router.get("/superadmin/all", protect, superadminGetAll);

// ── Header / footer update for a document ────────────────────────────────────
router.put(
  "/document/:documentId/header-footer",
  protect,
  async (req, res, next) => {
    const original = res.json.bind(res);
    res.json = async (data) => {
      if (res.statusCode < 400) {
        await logAudit(req, "Document", "UPDATE",
          `Updated header/footer for document "${req.params.documentId}"`,
          { entityId: req.params.documentId }
        );
      }
      return original(data);
    };
    return updateDocumentHeaderFooter(req, res, next);
  }
);

// ── Bulk save (auto-save) ─────────────────────────────────────────────────────
router.put(
  "/bulk-save",
  protect,
  async (req, res, next) => {
    const original = res.json.bind(res);
    res.json = async (data) => {
      if (res.statusCode < 400) {
        await logAudit(req, "Document", "UPDATE",
          `Auto-saved pages for document "${req.body.documentId}"`,
          { entityId: req.body.documentId }
        );
      }
      return original(data);
    };
    return bulkSavePages(req, res, next);
  }
);

// ── Standard CRUD ─────────────────────────────────────────────────────────────
router.get("/",    protect, getDocumentpages);
router.get("/:id", protect, getDocumentpageById);

router.post(
  "/",
  protect,
  async (req, res, next) => {
    const original = res.json.bind(res);
    res.json = async (data) => {
      if (res.statusCode < 400 && data?._id) {
        await logAudit(req, "Document", "CREATE",
          `Created page ${data.pageNumber} for document "${req.body.documentId}"`,
          { entityId: data._id?.toString() }
        );
      }
      return original(data);
    };
    return createDocumentPage(req, res, next);
  }
);

router.put(
  "/:id",
  protect,
  async (req, res, next) => {
    const original = res.json.bind(res);
    res.json = async (data) => {
      if (res.statusCode < 400) {
        await logAudit(req, "Document", "UPDATE",
          `Updated page ID "${req.params.id}"`,
          { entityId: req.params.id }
        );
      }
      return original(data);
    };
    return updateDocumentPage(req, res, next);
  }
);

router.delete(
  "/:id",
  protect,
  async (req, res, next) => {
    const original = res.json.bind(res);
    res.json = async (data) => {
      if (res.statusCode < 400) {
        await logAudit(req, "Document", "DELETE",
          `Deleted page ID "${req.params.id}"`,
          { entityId: req.params.id }
        );
      }
      return original(data);
    };
    return deleteDocumentPage(req, res, next);
  }
);

export default router;