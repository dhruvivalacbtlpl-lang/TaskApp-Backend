import express        from "express";
import multer         from "multer";
import path           from "path";
import fs             from "fs";
import { fileURLToPath } from "url";
import Company        from "../models/Company.js";
import { protect }   from "../middleware/auth.js";

const router = express.Router();

/* ─── Multer setup for logo uploads ─────────────────────────────────────────── */
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "../../uploads/images");
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext      = path.extname(file.originalname);
    const filename = `company-logo-${Date.now()}${ext}`;
    cb(null, filename);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed (jpg, png, webp, svg)"), false);
  }
};

const upload = multer({ storage: logoStorage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

/* ─── Helper: get company by req.user ────────────────────────────────────────── */
const getCompany = async (req) => {
  const companyId = req.user?.company || req.user?.companyId;
  if (companyId) return await Company.findById(companyId);
  return await Company.findOne().sort({ createdAt: 1 });
};

/* ─── GET /api/company/settings ─────────────────────────────────────────────── */
router.get("/settings", protect, async (req, res) => {
  try {
    const company = await getCompany(req);
    if (!company) return res.status(404).json({ message: "No company found" });
    return res.json(company);
  } catch (err) {
    console.error("❌ Get company settings error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ─── PUT /api/company/settings ─────────────────────────────────────────────── */
router.put("/settings", protect, async (req, res) => {
  try {
    const company = await getCompany(req);
    if (!company) return res.status(404).json({ message: "No company found" });

    const { workingHours, holidays, name, email, phone, address, website } = req.body;

    if (workingHours)        company.workingHours = workingHours;
    if (holidays)            company.holidays     = holidays;
    if (name)                company.name         = name;
    if (email)               company.email        = email;
    if (phone   !== undefined) company.phone      = phone;
    if (address !== undefined) company.address    = address;
    if (website !== undefined) company.website    = website;

    await company.save();
    return res.json({ message: "Settings saved successfully", company });
  } catch (err) {
    console.error("❌ Update company settings error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ─── PUT /api/company/profile ───────────────────────────────────────────────── */
/* Updates basic company info: name, email, phone, address, website             */
router.put("/profile", protect, async (req, res) => {
  try {
    const company = await getCompany(req);
    if (!company) return res.status(404).json({ message: "No company found" });

    const { name, email, phone, address, website } = req.body;

    if (name)               company.name    = name.trim();
    if (email)              company.email   = email.toLowerCase().trim();
    if (phone   !== undefined) company.phone   = phone;
    if (address !== undefined) company.address = address;
    if (website !== undefined) company.website = website;

    await company.save();
    return res.json({ message: "Profile updated successfully", company });
  } catch (err) {
    console.error("❌ Update company profile error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ─── PUT /api/company/logo ──────────────────────────────────────────────────── */
/* Accepts multipart/form-data with field name "logo"                            */
router.put("/logo", protect, upload.single("logo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const company = await getCompany(req);
    if (!company) return res.status(404).json({ message: "No company found" });

    // Delete old logo file if it exists
    if (company.logo) {
      const oldLogoPath = path.join(__dirname, "../../", company.logo.replace(/^\//, ""));
      if (fs.existsSync(oldLogoPath)) {
        fs.unlinkSync(oldLogoPath);
      }
    }

    // Save new logo URL (relative path served as static)
    company.logo = `/uploads/images/${req.file.filename}`;
    await company.save();

    return res.json({
      message:  "Logo uploaded successfully",
      logo:     company.logo,
      company,
    });
  } catch (err) {
    console.error("❌ Logo upload error:", err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
});

/* ─── DELETE /api/company/logo ───────────────────────────────────────────────── */
router.delete("/logo", protect, async (req, res) => {
  try {
    const company = await getCompany(req);
    if (!company) return res.status(404).json({ message: "No company found" });

    if (company.logo) {
      const logoPath = path.join(__dirname, "../../", company.logo.replace(/^\//, ""));
      if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
      company.logo = "";
      await company.save();
    }

    return res.json({ message: "Logo removed successfully", company });
  } catch (err) {
    console.error("❌ Delete logo error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;