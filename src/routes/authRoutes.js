import express    from "express";
import bcrypt     from "bcryptjs";
import jwt        from "jsonwebtoken";
import Staff      from "../models/Staff.js";
import Role       from "../models/Role.js";
import Company    from "../models/Company.js";
import { protect } from "../middleware/auth.js";
import { sendCompanyCreatedMail } from "../services/mail.js";

const router = express.Router();

/* ─── POST /api/auth/signup ──────────────────────────────────────────────────── */
router.post("/signup", async (req, res) => {
  try {
    const {
      companyName, companyEmail, companyPhone, companyAddress, companyWebsite,
      ownerName, ownerEmail, ownerPassword, ownerMobile,
    } = req.body;

    if (!companyName?.trim())     return res.status(400).json({ message: "Company name is required" });
    if (!companyEmail?.trim())    return res.status(400).json({ message: "Company email is required" });
    if (!ownerName?.trim())       return res.status(400).json({ message: "Your name is required" });
    if (!ownerEmail?.trim())      return res.status(400).json({ message: "Your email is required" });
    if (!ownerPassword)           return res.status(400).json({ message: "Password is required" });
    if (ownerPassword.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

    const existingCompany = await Company.findOne({
      name: { $regex: new RegExp(`^${companyName.trim()}$`, "i") },
    });
    if (existingCompany) return res.status(400).json({ message: "A company with this name already exists" });

    // Allow same email across different companies — only block exact email+company combo
    const existingStaff = await Staff.findOne({ email: ownerEmail.toLowerCase().trim() });
    // We don't block same email across companies — just warn in logs
    if (existingStaff) {
      console.log(`ℹ️ Email ${ownerEmail} already used in another company — allowing for new company`);
    }

    let adminRole = await Role.findOne({ name: { $regex: /^admin$/i } });
    if (!adminRole) {
      adminRole = await Role.create({ name: "Admin", permissions: [], status: 1 });
    }

    const hashedPassword = await bcrypt.hash(ownerPassword, 12);

    const company = await Company.create({
      name:    companyName.trim(),
      email:   companyEmail.toLowerCase().trim(),
      phone:   companyPhone   || "",
      address: companyAddress || "",
      website: companyWebsite || "",
    });

    const owner = await Staff.create({
      name:     ownerName.trim(),
      email:    ownerEmail.toLowerCase().trim(),
      mobile:   ownerMobile || "",
      password: hashedPassword,
      role:     adminRole._id,
      company:  company._id,
      isOwner:  true,
    });

    company.owner = owner._id;
    await company.save();

    try {
      await sendCompanyCreatedMail({
        ownerName:   ownerName.trim(),
        companyName: companyName.trim(),
        email:       ownerEmail.toLowerCase().trim(),
        password:    ownerPassword,
      });
    } catch (mailErr) {
      console.warn("⚠️ Welcome email failed:", mailErr.message);
    }

    return res.status(201).json({
      message: "Company and account created! Check your email.",
      company: { id: company._id, name: company.name },
    });
  } catch (err) {
    console.error("❌ Signup error:", err);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
});

/* ─── GET /api/auth/companies?email=xxx ─────────────────────────────────────────
 * Returns all companies that the given email belongs to.
 * Called from login page when user finishes typing their email.
 */
router.get("/companies", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const staffList = await Staff.find({ email: email.toLowerCase().trim() })
      .select("company")
      .populate("company", "name logo email");

    const companies = staffList
      .filter(s => s.company)
      .map(s => ({
        _id:   s.company._id,
        name:  s.company.name,
        logo:  s.company.logo || "",
        email: s.company.email,
      }));

    return res.json({ companies });
  } catch (err) {
    console.error("❌ Get companies error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ─── POST /api/auth/login ───────────────────────────────────────────────────── */
router.post("/login", async (req, res) => {
  try {
    const { email, password, companyId, companyName } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password are required" });

    // Build query to find the correct staff in the correct company
    const query = { email: email.toLowerCase().trim() };

    if (companyId) {
      // Best case: companyId sent directly
      query.company = companyId;
    } else if (companyName?.trim()) {
      // Fallback: find company by name first, then filter staff
      const company = await Company.findOne({
        name: { $regex: new RegExp(`^${companyName.trim()}$`, "i") },
      }).select("_id");
      if (company) query.company = company._id;
    }

    const staff = await Staff.findOne(query)
      .populate("role")
      .populate("company", "name status logo");

    if (!staff) return res.status(401).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, staff.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    let resolvedCompanyId = staff.company?._id || staff.company || null;

    // Fallback: assign first company if none linked
    if (!resolvedCompanyId) {
      const firstCompany = await Company.findOne().sort({ createdAt: 1 }).select("_id");
      if (firstCompany) {
        resolvedCompanyId = firstCompany._id;
        await Staff.findByIdAndUpdate(staff._id, { company: resolvedCompanyId });
        console.log(`✅ Auto-assigned company ${resolvedCompanyId} to ${staff.email}`);
      }
    }

    const token = jwt.sign(
      {
        id:        staff._id,
        isOwner:   staff.isOwner,
        role:      staff.role?._id || staff.role || null,
        company:   resolvedCompanyId,
        companyId: resolvedCompanyId,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const isSecure = req.headers.origin?.startsWith("https://");
    res.cookie("token", token, {
      httpOnly: true,
      secure:   isSecure,
      sameSite: isSecure ? "None" : "Lax",
      maxAge:   7 * 24 * 60 * 60 * 1000,
    });

    const updatedStaff = await Staff.findById(staff._id)
      .select("-password")
      .populate("role")
      .populate("company", "name status logo");

    return res.json({
      message: "Login successful",
      token,
      data: {
        _id:     updatedStaff._id,
        name:    updatedStaff.name,
        email:   updatedStaff.email,
        mobile:  updatedStaff.mobile,
        role:    updatedStaff.role,
        company: updatedStaff.company,
        isOwner: updatedStaff.isOwner,
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
      .populate("company", "name status workingHours holidays startDate endDate phone address website email logo");

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