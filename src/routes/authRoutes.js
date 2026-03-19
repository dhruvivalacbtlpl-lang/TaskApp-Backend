import express from "express";
import bcrypt  from "bcryptjs";
import jwt     from "jsonwebtoken";
import Staff   from "../models/Staff.js";
import Role    from "../models/Role.js";
import Company from "../models/Company.js";
import { protect }         from "../middleware/auth.js";
import { sendCompanyCreatedMail } from "../services/mail.js";
import { logAudit }        from "../utils/logAudit.js";
import { assignFreeTrial } from "../controllers/subscriptionController.js"; // ← NEW

const router = express.Router();

/* ─── POST /api/auth/signup ───────────────────────────────────────────────── */
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
    if (existingCompany)
      return res.status(400).json({ message: "A company with this name already exists" });

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
      isActive: true,
    });

    company.owner = owner._id;
    await company.save();

    // ✅ Auto-assign 1-month free trial on every new company signup
    await assignFreeTrial(company._id);

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
      message: "Company created! You have a 1-month free trial. Check your email.",
      company: { id: company._id, name: company.name },
    });
  } catch (err) {
    console.error("❌ Signup error:", err);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
});

/* ─── GET /api/auth/companies?email=xxx ───────────────────────────────────── */
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

/* ─── POST /api/auth/login ────────────────────────────────────────────────── */
router.post("/login", async (req, res) => {
  try {
    const { email, password, companyId, companyName } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required" });

    const query = { email: email.toLowerCase().trim() };
    if (companyId) {
      query.company = companyId;
    } else if (companyName?.trim()) {
      const company = await Company.findOne({
        name: { $regex: new RegExp(`^${companyName.trim()}$`, "i") },
      }).select("_id");
      if (company) query.company = company._id;
    }

    const staff = await Staff.findOne(query)
      .populate("role")
      .populate("company", "name status logo");

    if (!staff) return res.status(401).json({ message: "Invalid credentials" });

    // ✅ Block deactivated staff (auto-deactivated when plan limit exceeded)
    if (!staff.isOwner && !staff.isSuperAdmin && staff.isActive === false) {
      return res.status(403).json({
        code:    "ACCOUNT_DEACTIVATED",
        message: "Your account has been deactivated due to a plan limit. Please contact your company owner to upgrade.",
      });
    }

    const isMatch = await bcrypt.compare(password, staff.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    let resolvedCompanyId = staff.company?._id || staff.company || null;
    if (!resolvedCompanyId) {
      const firstCompany = await Company.findOne().sort({ createdAt: 1 }).select("_id");
      if (firstCompany) {
        resolvedCompanyId = firstCompany._id;
        await Staff.findByIdAndUpdate(staff._id, { company: resolvedCompanyId });
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

    // ✅ Cookie fix: sameSite "Lax" in dev, "None" only in prod (requires secure)
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("token", token, {
      httpOnly: true,
      secure:   isProd,
      sameSite: isProd ? "None" : "Lax",
      maxAge:   7 * 24 * 60 * 60 * 1000,
    });

    const updatedStaff = await Staff.findById(staff._id)
      .select("-password")
      .populate("role")
      .populate("company", "name status logo");

    req.user = {
      _id:       staff._id,
      id:        staff._id,
      name:      staff.name,
      companyId: resolvedCompanyId?.toString() || null,
      isOwner:   staff.isOwner,
      role:      staff.role,
    };
    await logAudit(
      req, "Auth", "LOGIN",
      `"${staff.name}" logged in to ${staff.company?.name || "Unknown Company"}`,
      { entityId: staff._id.toString(), entityName: staff.name }
    ).catch(err => console.warn("⚠️ Login audit failed:", err.message));

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

/* ─── GET /api/auth/profile ───────────────────────────────────────────────── */
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

/* ─── POST /api/auth/logout ───────────────────────────────────────────────── */
router.post("/logout", protect, async (req, res) => {
  try {
    await logAudit(
      req, "Auth", "LOGOUT",
      `"${req.user?.name || "User"}" logged out`,
      { entityName: req.user?.name }
    ).catch(err => console.warn("⚠️ Logout audit failed:", err.message));
  } catch (err) {
    console.warn("Logout audit error:", err.message);
  }

  const isProd = process.env.NODE_ENV === "production";
  res.clearCookie("token", {
    httpOnly: true,
    secure:   isProd,
    sameSite: isProd ? "None" : "Lax",
  });
  return res.json({ message: "Logged out successfully" });
});

export default router;