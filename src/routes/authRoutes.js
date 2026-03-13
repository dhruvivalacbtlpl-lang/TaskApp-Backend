import express    from "express";
import bcrypt      from "bcryptjs";
import jwt         from "jsonwebtoken";
import Staff       from "../models/Staff.js";
import Role        from "../models/Role.js";
import Company     from "../models/Company.js";
import { protect } from "../middleware/auth.js";
import { sendAccessRequestMail } from "../services/mail.js";

const router = express.Router();

/* ─── POST /api/auth/signup ──────────────────────────────────────────────────── */
router.post("/signup", async (req, res) => {
  try {
    const {
      companyName, companyEmail, companyPhone, companyAddress, companyWebsite,
      ownerName, ownerEmail, ownerPassword, ownerMobile,
    } = req.body;

    // ── Validation ────────────────────────────────────────────────────────────
    if (!companyName?.trim())     return res.status(400).json({ message: "Company name is required" });
    if (!companyEmail?.trim())    return res.status(400).json({ message: "Company email is required" });
    if (!ownerName?.trim())       return res.status(400).json({ message: "Your name is required" });
    if (!ownerEmail?.trim())      return res.status(400).json({ message: "Your email is required" });
    if (!ownerPassword)           return res.status(400).json({ message: "Password is required" });
    if (ownerPassword.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

    // ── Check duplicates ──────────────────────────────────────────────────────
    const existingCompany = await Company.findOne({
      name: { $regex: new RegExp(`^${companyName.trim()}$`, "i") },
    });
    if (existingCompany) return res.status(400).json({ message: "A company with this name already exists" });

    const existingStaff = await Staff.findOne({ email: ownerEmail.toLowerCase().trim() });
    if (existingStaff) return res.status(400).json({ message: "An account with this email already exists" });

    // ── Get or create Admin role ──────────────────────────────────────────────
    let adminRole = await Role.findOne({ name: { $regex: /^admin$/i } });
    if (!adminRole) {
      adminRole = await Role.create({ name: "Admin", permissions: [], status: 1 });
    }

    // ── Hash password ─────────────────────────────────────────────────────────
    const hashedPassword = await bcrypt.hash(ownerPassword, 12);

    // ── Create company ────────────────────────────────────────────────────────
    const company = await Company.create({
      name:    companyName.trim(),
      email:   companyEmail.toLowerCase().trim(),
      phone:   companyPhone   || "",
      address: companyAddress || "",
      website: companyWebsite || "",
    });

    // ── Create owner staff ────────────────────────────────────────────────────
    const owner = await Staff.create({
      name:     ownerName.trim(),
      email:    ownerEmail.toLowerCase().trim(),
      mobile:   ownerMobile || "",
      password: hashedPassword,
      role:     adminRole._id,
      company:  company._id,
      isOwner:  true,
    });

    // ── Link owner back to company ────────────────────────────────────────────
    company.owner = owner._id;
    await company.save();

    // ── Send welcome email ────────────────────────────────────────────────────
    await sendCompanyCreatedMail({
      ownerName:   ownerName.trim(),
      companyName: companyName.trim(),
      email:       ownerEmail.toLowerCase().trim(),
      password:    ownerPassword,
    });

    return res.status(201).json({
      message: "Company and account created! Check your email.",
      company: { id: company._id, name: company.name },
    });
  } catch (err) {
    console.error("❌ Signup error:", err);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
});

/* ─── POST /api/auth/login ───────────────────────────────────────────────────── */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password are required" });

    const staff = await Staff.findOne({ email: email.toLowerCase().trim() })
      .populate("role")
      .populate("company", "name status");

    if (!staff) return res.status(401).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, staff.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: staff._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    const isSecure = req.headers.origin?.startsWith("https://");
    res.cookie("token", token, {
      httpOnly: true,
      secure:   isSecure,
      sameSite: isSecure ? "None" : "Lax",
      maxAge:   7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      message: "Login successful",
      data: {
        _id:     staff._id,
        name:    staff.name,
        email:   staff.email,
        mobile:  staff.mobile,
        role:    staff.role,
        company: staff.company,
        isOwner: staff.isOwner,
      },
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ─── GET /api/auth/profile ──────────────────────────────────────────────────── */
router.get("/profile", protect, async (req, res) => {
  try {
    const staff = await Staff.findById(req.user._id)
      .select("-password")
      .populate("role")
      .populate("company", "name status workingHours holidays startDate endDate");

    if (!staff) return res.status(404).json({ message: "Staff not found" });
    return res.json(staff);
  } catch (err) {
    console.error("❌ Profile error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ─── POST /api/auth/logout ──────────────────────────────────────────────────── */
router.post("/logout", (req, res) => {
  res.clearCookie("token", { httpOnly: true, sameSite: "None", secure: true });
  return res.json({ message: "Logged out successfully" });
});

export default router;