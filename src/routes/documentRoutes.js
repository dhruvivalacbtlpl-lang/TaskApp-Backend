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
} from "../controllers/documentController.js";

// ── Multer storage for documents ──────────────────────────────────────────────
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /pdf|doc|docx|xls|xlsx|ppt|pptx|txt|jpg|jpeg|png|gif|webp/;
    const ext = path.extname(file.originalname).toLowerCase().replace(".", "");
    cb(null, allowed.test(ext));
  },
});

const router = express.Router();

// ── Access Requests (before /:id to avoid collision) ─────────────────────────
router.get("/access-requests",            getAccessRequests);
router.put("/access-requests/:requestId", respondToAccessRequest);

// ── Documents ─────────────────────────────────────────────────────────────────
router.get("/",       getDocuments);
router.get("/:id",    getDocumentById);
router.post("/",      upload.single("file"), createDocument);
router.put("/:id",    upload.single("file"), updateDocument);
router.delete("/:id", deleteDocument);

// ── Request Access ────────────────────────────────────────────────────────────
router.post("/:id/request-access", requestAccess);

export default router;