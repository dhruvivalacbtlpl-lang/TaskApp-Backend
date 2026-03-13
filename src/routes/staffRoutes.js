import express    from "express";
import bcrypt      from "bcryptjs";
import Staff       from "../models/Staff.js";
import Company     from "../models/Company.js";
import { protect } from "../middleware/auth.js";
import { sendWelcomeStaffMail } from "../services/mail.js";

const router = express.Router();

/* ─── GET /api/staff ─────────────────────────────────────────────────────────
 * Returns staff filtered by the logged-in user's company.
 * If user has no company, returns all staff (backward compatible).
 */
router.get("/", protect, async (req, res) => {
  try {
    const filter = {};
    if (req.user?.company) {
      filter.company = req.user.company;
    }

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

/* ─── GET /api/staff/:id ─────────────────────────────────────────────────────── */
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

/* ─── POST /api/staff ────────────────────────────────────────────────────────
 * Create staff. Password typed manually (not auto-generated).
 * Inherits company from logged-in user. Sends welcome email.
 */
router.post("/", protect, async (req, res) => {
  try {
    const { name, email, mobile, password, role } = req.body;

    if (!name?.trim())       return res.status(400).json({ message: "Name is required" });
    if (!email?.trim())      return res.status(400).json({ message: "Email is required" });
    if (!password)           return res.status(400).json({ message: "Password is required" });
    if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

    const existing = await Staff.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ message: "Email already in use" });

    const hashedPassword = await bcrypt.hash(password, 12);

    // Inherit company from the logged-in user (owner/admin)
    const companyId = req.user?.company || null;

    const staff = await Staff.create({
      name:     name.trim(),
      email:    email.toLowerCase().trim(),
      mobile:   mobile || "",
      password: hashedPassword,
      role:     role || null,
      company:  companyId,
      isOwner:  false,
    });

    // Get company name for the email
    let companyName = "TaskApp";
    if (companyId) {
      const company = await Company.findById(companyId).select("name");
      if (company) companyName = company.name;
    }

    // Send welcome email with credentials
    await sendWelcomeStaffMail({
      name:        name.trim(),
      email:       email.toLowerCase().trim(),
      password,    // plain text — for the email only
      companyName,
    });

    const populated = await Staff.findById(staff._id)
      .select("-password")
      .populate("role",    "name permissions")
      .populate("company", "name");

    return res.status(201).json(populated);
  } catch (err) {
    console.error("❌ Create staff error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ─── PUT /api/staff/:id ─────────────────────────────────────────────────────── */
router.put("/:id", protect, async (req, res) => {
  try {
    const { name, email, mobile, role, password } = req.body;

    const staff = await Staff.findById(req.params.id);
    if (!staff) return res.status(404).json({ message: "Staff not found" });

    if (name)                staff.name   = name.trim();
    if (email)               staff.email  = email.toLowerCase().trim();
    if (mobile !== undefined) staff.mobile = mobile;
    if (role)                staff.role   = role;

    if (password) {
      if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
      staff.password = await bcrypt.hash(password, 12);
    }

    await staff.save();

    const updated = await Staff.findById(staff._id)
      .select("-password")
      .populate("role",    "name permissions")
      .populate("company", "name");

    return res.json(updated);
  } catch (err) {
    console.error("❌ Update staff error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ─── DELETE /api/staff/:id ──────────────────────────────────────────────────── */
router.delete("/:id", protect, async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id);
    if (!staff) return res.status(404).json({ message: "Staff not found" });

    if (staff.isOwner) {
      return res.status(403).json({ message: "Cannot delete the company owner" });
    }

    await staff.deleteOne();
    return res.json({ message: "Staff deleted successfully" });
  } catch (err) {
    console.error("❌ Delete staff error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
