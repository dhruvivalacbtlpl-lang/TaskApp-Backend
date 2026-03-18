import express from "express";
import bcrypt  from "bcryptjs";
import Staff   from "../models/Staff.js";
import Company from "../models/Company.js";
import { protect } from "../middleware/auth.js";
import { sendWelcomeStaffMail } from "../services/mail.js";
import { logAudit } from "../utils/logAudit.js";

const router = express.Router();

/* ─── GET /api/staff ─────────────────────────────────────────────────────────*/
router.get("/", protect, async (req, res) => {
  try {
    const filter = req.user.isSuperAdmin ? {} : { company: req.user.company };
    const staffList = await Staff.find(filter)
      .select("-password")
      .populate("role",    "name permissions")
      .populate("company", "name");
    return res.json(staffList);
  } catch (err) {
    console.error("❌ Get staff error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ─── GET /api/staff/:id ──────────────────────────────────────────────────── */
router.get("/:id", protect, async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id)
      .select("-password")
      .populate("role",    "name permissions")
      .populate("company", "name");
    if (!staff) return res.status(404).json({ message: "Staff not found" });
    return res.json(staff);
  } catch (err) {
    console.error("❌ Get staff by id error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ─── POST /api/staff ────────────────────────────────────────────────────────*/
router.post("/", protect, async (req, res) => {
  try {
    const { name, email, mobile, password, role, companyId: bodyCompanyId } = req.body;

    if (!name?.trim())       return res.status(400).json({ message: "Name is required" });
    if (!email?.trim())      return res.status(400).json({ message: "Email is required" });
    if (!password)           return res.status(400).json({ message: "Password is required" });
    if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

    const companyId = req.user.isSuperAdmin
      ? bodyCompanyId || null
      : req.user.company;

    const existing = await Staff.findOne({ email: email.toLowerCase().trim(), company: companyId });
    if (existing) return res.status(400).json({ message: "Email already in use in this company" });

    const hashedPassword = await bcrypt.hash(password, 12);

    const staff = await Staff.create({
      name:     name.trim(),
      email:    email.toLowerCase().trim(),
      mobile:   mobile || "",
      password: hashedPassword,
      role:     role || null,
      company:  companyId,
      isOwner:  false,
    });

    let companyName = "TaskApp";
    if (companyId) {
      const company = await Company.findById(companyId).select("name");
      if (company) companyName = company.name;
    }

    await sendWelcomeStaffMail({ name: name.trim(), email: email.toLowerCase().trim(), password, companyName });

    const populated = await Staff.findById(staff._id)
      .select("-password")
      .populate("role",    "name permissions")
      .populate("company", "name");

    // ── Audit log ──────────────────────────────────────────────────────────
    await logAudit(req, "Staff", "CREATE",
      `Created staff member "${name.trim()}"`,
      { entityId: staff._id.toString(), entityName: name.trim() }
    );

    return res.status(201).json(populated);
  } catch (err) {
    console.error("❌ Create staff error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ─── PUT /api/staff/:id ─────────────────────────────────────────────────────*/
router.put("/:id", protect, async (req, res) => {
  try {
    const { name, email, mobile, role, password } = req.body;

    const staff = await Staff.findById(req.params.id);
    if (!staff) return res.status(404).json({ message: "Staff not found" });

    if (!req.user.isSuperAdmin && String(staff.company) !== String(req.user.company)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const before = { name: staff.name, email: staff.email, role: staff.role };

    if (name)                 staff.name   = name.trim();
    if (email)                staff.email  = email.toLowerCase().trim();
    if (mobile !== undefined) staff.mobile = mobile;
    if (role)                 staff.role   = role;

    if (password) {
      if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
      staff.password = await bcrypt.hash(password, 12);
    }

    await staff.save();

    const updated = await Staff.findById(staff._id)
      .select("-password")
      .populate("role",    "name permissions")
      .populate("company", "name");

    // ── Audit log ──────────────────────────────────────────────────────────
    await logAudit(req, "Staff", "UPDATE",
      `Updated staff member "${staff.name}"`,
      { entityId: staff._id.toString(), entityName: staff.name, before }
    );

    return res.json(updated);
  } catch (err) {
    console.error("❌ Update staff error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ─── DELETE /api/staff/:id ──────────────────────────────────────────────────*/
router.delete("/:id", protect, async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id);
    if (!staff) return res.status(404).json({ message: "Staff not found" });

    if (staff.isOwner) {
      return res.status(403).json({ message: "Cannot delete the company owner" });
    }

    if (!req.user.isSuperAdmin && String(staff.company) !== String(req.user.company)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const staffName = staff.name;
    const staffId   = staff._id.toString();

    await staff.deleteOne();

    // ── Audit log ──────────────────────────────────────────────────────────
    await logAudit(req, "Staff", "DELETE",
      `Deleted staff member "${staffName}"`,
      { entityId: staffId, entityName: staffName }
    );

    return res.json({ message: "Staff deleted successfully" });
  } catch (err) {
    console.error("❌ Delete staff error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;