import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Staff from "../models/Staff.js";
import Role from "../models/Role.js";
import Company from "../models/Company.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

/* ─── POST /api/auth/signup (Corrected) ────────────────────────────────────── */
router.post("/signup", async (req, res) => {
  try {
    const { companyName, ownerEmail, ownerPassword, ownerName } = req.body;

    const existingCompany = await Company.findOne({
      name: { $regex: new RegExp(`^${companyName.trim()}$`, "i") },
    });
    if (existingCompany) return res.status(400).json({ message: "Company already exists" });

    const company = await Company.create({ name: companyName.trim() });
    const hashedPassword = await bcrypt.hash(ownerPassword, 12);

    const owner = await Staff.create({
      name: ownerName,
      email: ownerEmail.toLowerCase().trim(),
      password: hashedPassword,
      company: company._id,
      isOwner: true,
    });

    company.owner = owner._id;
    await company.save();

    res.status(201).json({ message: "Company created!", company });
  } catch (err) {
    res.status(500).json({ message: "Signup failed" });
  }
});

/* ─── POST /api/auth/login (Corrected) ─────────────────────────────────────── */
router.post("/login", async (req, res) => {
  try {
    const { email, password, companyName } = req.body;

    const company = await Company.findOne({ name: companyName.trim() });
    if (!company) return res.status(404).json({ message: "Company not found" });

    const staff = await Staff.findOne({ 
      email: email.toLowerCase().trim(), 
      company: company._id 
    }).populate("role").populate("company");

    if (!staff || !(await bcrypt.compare(password, staff.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Pack companyId into the token
    const token = jwt.sign(
      { id: staff._id, companyId: company._id }, 
      process.env.JWT_SECRET, 
      { expiresIn: "7d" }
    );

    res.cookie("token", token, { httpOnly: true, secure: false, sameSite: "Lax" });
    res.json({ message: "Login successful", token, data: staff });
  } catch (err) {
    res.status(500).json({ message: "Login error" });
  }
});

/* ─── GET /api/auth/profile (Corrected for Dashboard) ───────────────────────── */
router.get("/profile", protect, async (req, res) => {
  try {
    const staff = await Staff.findOne({ 
      _id: req.user.id, 
      company: req.user.companyId 
    }).populate("role").populate("company");

    if (!staff) return res.status(404).json({ message: "User not found" });
    res.json(staff);
  } catch (err) {
    res.status(500).json({ message: "Profile error" });
  }
});

export default router;