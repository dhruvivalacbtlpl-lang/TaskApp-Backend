import express        from "express";
import multer         from "multer";
import path           from "path";
import fs             from "fs";
import { fileURLToPath } from "url";
import Company        from "../models/Company.js";
import { protect, superAdminOnly } from "../middleware/auth.js";
import { logAudit } from "../utils/logAudit.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "../../uploads/images");
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `company-logo-${Date.now()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg","image/jpg","image/png","image/webp","image/svg+xml"];
  allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error("Only image files allowed"), false);
};

const upload = multer({ storage: logoStorage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

const getCompany = async (req) => {
  const companyId = req.user?.company || req.user?.companyId;
  if (companyId) return await Company.findById(companyId);
  return await Company.findOne().sort({ createdAt: 1 });
};

/* ═══════════════════════════════════════════════════════════════════
   SUPERADMIN ROUTES
═══════════════════════════════════════════════════════════════════ */

router.get("/all", protect, superAdminOnly, async (req, res) => {
  try {
    const companies = await Company.find().sort({ createdAt: -1 });
    return res.json(companies);
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/:id/profile", protect, superAdminOnly, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: "Company not found" });

    const { name, email, phone, address, website, workingHours } = req.body;
    const before = { name: company.name, email: company.email };

    if (name)                  company.name         = name.trim();
    if (email)                 company.email        = email.toLowerCase().trim();
    if (phone   !== undefined) company.phone        = phone;
    if (address !== undefined) company.address      = address;
    if (website !== undefined) company.website      = website;
    if (workingHours)          company.workingHours = workingHours;

    await company.save();

    await logAudit(req, "Staff", "UPDATE",
      `SuperAdmin updated company "${company.name}" profile`,
      { entityId: company._id.toString(), entityName: company.name, before }
    );

    return res.json({ message: "Company updated", company });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/:id/logo", protect, superAdminOnly, upload.single("logo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: "Company not found" });

    if (company.logo) {
      const oldPath = path.join(__dirname, "../../", company.logo.replace(/^\//, ""));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    company.logo = `/uploads/images/${req.file.filename}`;
    await company.save();

    await logAudit(req, "Staff", "UPDATE",
      `Updated logo for company "${company.name}"`,
      { entityId: company._id.toString(), entityName: company.name }
    );

    return res.json({ message: "Logo uploaded", logo: company.logo, company });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
});

router.delete("/:id/logo", protect, superAdminOnly, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: "Company not found" });

    if (company.logo) {
      const logoPath = path.join(__dirname, "../../", company.logo.replace(/^\//, ""));
      if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
      company.logo = "";
      await company.save();
    }

    await logAudit(req, "Staff", "DELETE",
      `Removed logo for company "${company.name}"`,
      { entityId: company._id.toString(), entityName: company.name }
    );

    return res.json({ message: "Logo removed", company });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.patch("/:id/status", protect, superAdminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    if (status !== 0 && status !== 1)
      return res.status(400).json({ message: "Status must be 0 or 1" });

    const company = await Company.findByIdAndUpdate(
      req.params.id, { status }, { new: true }
    );
    if (!company) return res.status(404).json({ message: "Company not found" });

    await logAudit(req, "Staff", status === 1 ? "UPDATE" : "DELETE",
      `${status === 1 ? "Restored" : "Deactivated"} company "${company.name}"`,
      { entityId: company._id.toString(), entityName: company.name }
    );

    return res.json({
      message: status === 1 ? "Company restored" : "Company deactivated",
      company,
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   NORMAL (per-company) ROUTES
═══════════════════════════════════════════════════════════════════ */

router.get("/settings", protect, async (req, res) => {
  try {
    const company = await getCompany(req);
    if (!company) return res.status(404).json({ message: "No company found" });
    return res.json(company);
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/settings", protect, async (req, res) => {
  try {
    const company = await getCompany(req);
    if (!company) return res.status(404).json({ message: "No company found" });

    const { workingHours, holidays, name, email, phone, address, website } = req.body;

    if (workingHours)          company.workingHours = workingHours;
    if (holidays)              company.holidays     = holidays;
    if (name)                  company.name         = name;
    if (email)                 company.email        = email;
    if (phone   !== undefined) company.phone        = phone;
    if (address !== undefined) company.address      = address;
    if (website !== undefined) company.website      = website;

    await company.save();

    await logAudit(req, "Staff", "UPDATE",
      `Updated company settings for "${company.name}"`,
      { entityId: company._id.toString(), entityName: company.name }
    );

    return res.json({ message: "Settings saved successfully", company });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/profile", protect, async (req, res) => {
  try {
    const company = await getCompany(req);
    if (!company) return res.status(404).json({ message: "No company found" });

    const { name, email, phone, address, website } = req.body;
    const before = { name: company.name, email: company.email };

    if (name)                  company.name    = name.trim();
    if (email)                 company.email   = email.toLowerCase().trim();
    if (phone   !== undefined) company.phone   = phone;
    if (address !== undefined) company.address = address;
    if (website !== undefined) company.website = website;

    await company.save();

    await logAudit(req, "Staff", "UPDATE",
      `Updated company profile for "${company.name}"`,
      { entityId: company._id.toString(), entityName: company.name, before }
    );

    return res.json({ message: "Profile updated successfully", company });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/logo", protect, upload.single("logo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const company = await getCompany(req);
    if (!company) return res.status(404).json({ message: "No company found" });

    if (company.logo) {
      const oldLogoPath = path.join(__dirname, "../../", company.logo.replace(/^\//, ""));
      if (fs.existsSync(oldLogoPath)) fs.unlinkSync(oldLogoPath);
    }

    company.logo = `/uploads/images/${req.file.filename}`;
    await company.save();

    return res.json({ message: "Logo uploaded successfully", logo: company.logo, company });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
});

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
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;