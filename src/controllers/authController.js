import bcryptjs from "bcryptjs";
import Staff from "../models/Staff.js";
import Company from "../models/Company.js";
import jwt from "jsonwebtoken";

export const signup = async (req, res) => {
  try {
    const { companyName, companyEmail, ownerName, ownerEmail, password, phone, address, website } = req.body;

    const existingCompany = await Company.findOne({ name: companyName });
    if (existingCompany) return res.status(400).json({ message: "This company name is already taken." });

    const existingOwner = await Staff.findOne({ email: ownerEmail, isOwner: true });
    if (existingOwner) return res.status(400).json({ message: "An account with this email already exists." });

    const newCompany = new Company({
      name: companyName, email: companyEmail, phone, address, website,
      workingHours: [
        { day: "monday",    startTime: "09:00", endTime: "18:00", isWorking: true, breaks: [] },
        { day: "tuesday",   startTime: "09:00", endTime: "18:00", isWorking: true, breaks: [] },
        { day: "wednesday", startTime: "09:00", endTime: "18:00", isWorking: true, breaks: [] },
        { day: "thursday",  startTime: "09:00", endTime: "18:00", isWorking: true, breaks: [] },
        { day: "friday",    startTime: "09:00", endTime: "18:00", isWorking: true, breaks: [] },
      ],
    });
    const savedCompany = await newCompany.save();
    const hashedPassword = await bcryptjs.hash(password, 10);
    await new Staff({ name: ownerName, email: ownerEmail, password: hashedPassword, company: savedCompany._id, isOwner: true }).save();

    res.status(201).json({ message: "Company and owner account created successfully!", companyId: savedCompany._id });
  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({ message: "Server error", details: err.message });
  }
};

/**
 * LOGIN
 * SuperAdmin  → email + password only (no companyId needed)
 * Normal user → email + password + companyId
 */
export const login = async (req, res) => {
  try {
    const { email, password, companyId } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // ── 1. SuperAdmin check ──────────────────────────────────────────────────
    const superAdmin = await Staff.findOne({ email: email.toLowerCase().trim(), isSuperAdmin: true });

    if (superAdmin) {
      const isMatch = await bcryptjs.compare(password, superAdmin.password);
      if (!isMatch) return res.status(401).json({ message: "Invalid password" });

      const token = jwt.sign(
        { id: superAdmin._id, isSuperAdmin: true, role: "superadmin" },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );

      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "None",
        maxAge: 24 * 60 * 60 * 1000,
      });

      return res.status(200).json({
        message: "Login successful",
        data: {
          _id:          superAdmin._id,
          name:         superAdmin.name,
          email:        superAdmin.email,
          isSuperAdmin: true,
          role:         { name: "SuperAdmin" },
        },
        company: null,
      });
    }

    // ── 2. Normal user login ─────────────────────────────────────────────────
    if (!companyId) {
      return res.status(400).json({ message: "Company is required" });
    }

    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ message: "Company not found" });

    const user = await Staff.findOne({ email: email.toLowerCase().trim(), company: company._id }).populate("role");
    if (!user) return res.status(401).json({ message: "No user found with this email in " + company.name });

    const isMatch = await bcryptjs.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid password" });

    const token = jwt.sign(
      { id: user._id, role: user.role?.name || "staff", companyId: company._id, isSuperAdmin: false },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "None",
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      message: "Login successful",
      data: user,
      company: { id: company._id, name: company.name },
    });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const logout = async (req, res) => {
  res.clearCookie("token", { httpOnly: true, secure: true, sameSite: "None" });
  res.status(200).json({ message: "Logged out successfully" });
};

export const getProfile = async (req, res) => {
  try {
    if (req.user?.isSuperAdmin) {
      const superAdmin = await Staff.findById(req.user.id).select("-password");
      if (!superAdmin) return res.status(404).json({ message: "User not found" });
      return res.json({ ...superAdmin.toObject(), isSuperAdmin: true, role: { name: "SuperAdmin" } });
    }

    const user = await Staff.findOne({ _id: req.user.id, company: req.user.companyId })
      .populate("role").populate("company");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};