// routes/documentRoutes.js
import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import Staff from "../models/Staff.js";
import {
  getDocuments,
  getDocumentById,
  getAccessRequests,
  createDocument,
  updateDocument,
  deleteDocument,
  requestAccess,
  requestModuleAccess,
  respondToAccessRequest,
} from "../controllers/documentController.js";

const router = express.Router();

// ── ENSURE UPLOAD DIRECTORY EXISTS ───────────────────────────────────────────
const uploadDir = "uploads/documents";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ── MULTER CONFIG ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  // Allow common document/image types — one file only (enforced by upload.single)
  const allowed = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("File type not allowed. Supported: PDF, Word, Excel, PowerPoint, TXT, images."));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
});

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
const attachUser = async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: "Not authenticated" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const staff = await Staff.findById(decoded.id).populate("role");
    if (!staff) return res.status(401).json({ error: "User not found" });
    req.user = staff;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

router.use(attachUser);

// ── STATIC ROUTES — before /:id ───────────────────────────────────────────────
router.get("/access-requests",            getAccessRequests);
router.put("/access-requests/:requestId", respondToAccessRequest);
router.post("/request-module-access",     requestModuleAccess);

// ── DOCUMENT CRUD ─────────────────────────────────────────────────────────────
router.get("/",    getDocuments);
router.post("/",   upload.single("file"), createDocument);   // file field name = "file"
router.get("/:id", getDocumentById);
router.put("/:id", upload.single("file"), updateDocument);
router.delete("/:id", deleteDocument);

// ── PER-DOCUMENT ACCESS REQUEST ───────────────────────────────────────────────
router.post("/:id/request-access", requestAccess);

// ── MULTER ERROR HANDLER ──────────────────────────────────────────────────────
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File too large. Maximum size is 10MB." });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: err.message });
  next();
});

export default router;