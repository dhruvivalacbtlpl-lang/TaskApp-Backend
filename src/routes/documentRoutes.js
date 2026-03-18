import express from "express";
import path    from "path";
import fs      from "fs";
import multer  from "multer";
import {
  getDocuments,
  getDocumentById,
  getAccessRequests,
  createDocument,
  updateDocument,
  deleteDocument,
  requestAccess,
  respondToAccessRequest,
  verifyDocumentToken,
} from "../controllers/documentController.js";
import { logAudit } from "../utils/logAudit.js";

// ── Multer storage ────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/documents";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /pdf|doc|docx|xls|xlsx|ppt|pptx|txt|jpg|jpeg|png|gif|webp/;
    const ext = path.extname(file.originalname).toLowerCase().replace(".", "");
    cb(null, allowed.test(ext));
  },
});

const router = express.Router();

// ── Token verify ──────────────────────────────────────────────────────────────
router.get("/verify-token", verifyDocumentToken);

// ── Access Requests ───────────────────────────────────────────────────────────
router.get("/access-requests",            getAccessRequests);
router.put("/access-requests/:requestId", respondToAccessRequest);

// ── GET (reads — no audit needed) ─────────────────────────────────────────────
router.get("/",    getDocuments);
router.get("/:id", getDocumentById);

// ── CREATE ────────────────────────────────────────────────────────────────────
router.post("/", upload.single("file"), async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = async (data) => {
    if (res.statusCode < 400 && data?._id) {
      await logAudit(req, "Document", "CREATE",
        `Created document "${data.title || data.name || "Untitled"}"`,
        { entityId: data._id?.toString(), entityName: data.title || data.name }
      );
    }
    return originalJson(data);
  };
  return createDocument(req, res, next);
});

// ── UPDATE ────────────────────────────────────────────────────────────────────
router.put("/:id", upload.single("file"), async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = async (data) => {
    if (res.statusCode < 400 && data) {
      await logAudit(req, "Document", "UPDATE",
        `Updated document "${data.title || data.name || req.params.id}"`,
        { entityId: req.params.id, entityName: data.title || data.name }
      );
    }
    return originalJson(data);
  };
  return updateDocument(req, res, next);
});

// ── DELETE ────────────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = async (data) => {
    if (res.statusCode < 400) {
      await logAudit(req, "Document", "DELETE",
        `Deleted document ID "${req.params.id}"`,
        { entityId: req.params.id }
      );
    }
    return originalJson(data);
  };
  return deleteDocument(req, res, next);
});

// ── Request Access ────────────────────────────────────────────────────────────
router.post("/:id/request-access", requestAccess);

export default router;