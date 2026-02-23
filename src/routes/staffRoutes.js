import express from "express";
import Staff from "../models/Staff.js";
import Role from "../models/Role.js";
import bcrypt from "bcryptjs";
import { sendStaffMail } from "../services/mail.js";

const router = express.Router();

/* =========================
   GET ALL STAFF
========================= */
router.get("/", async (req, res) => {
  try {
    const staff = await Staff.find().populate("role").sort({ createdAt: -1 });
    res.json(staff);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   GET SINGLE STAFF BY ID
========================= */
router.get("/:id", async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id).populate("role");
    if (!staff) return res.status(404).json({ error: "Staff not found" });
    res.json(staff);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   CREATE STAFF + SEND EMAIL
========================= */
router.post("/create", async (req, res) => {
  try {
    const { name, email, mobile, role } = req.body;

    // ✅ Check if selected role is Admin
    const selectedRole = await Role.findById(role);
    if (selectedRole?.name?.toLowerCase() === "admin") {
      // ✅ Check if requester is admin via cookie token
      const jwt = await import("jsonwebtoken");
      const token = req.cookies?.token;
      if (!token) {
        return res.status(403).json({ error: "Only admins can create admin accounts" });
      }
      try {
        const decoded = jwt.default.verify(token, process.env.JWT_SECRET);
        const requester = await Staff.findById(decoded.id).populate("role");
        if (requester?.role?.name?.toLowerCase() !== "admin") {
          return res.status(403).json({ error: "Only admins can create admin accounts" });
        }
      } catch {
        return res.status(403).json({ error: "Only admins can create admin accounts" });
      }
    }

    const exists = await Staff.findOne({ email });
    if (exists)
      return res.status(400).json({ error: "Email already exists" });

    const plainPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const staff = await Staff.create({
      name,
      email,
      mobile,
      role,
      password: hashedPassword,
    });

    await sendStaffMail(
      email,
      `Hello ${name},\n\nYour account has been created.\nEmail: ${email}\nPassword: ${plainPassword}\n\nPlease log in and change your password.`
    );

    const populatedStaff = await Staff.findById(staff._id).populate("role");
    res.status(201).json(populatedStaff);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   UPDATE STAFF + SEND EMAIL
========================= */
router.put("/:id", async (req, res) => {
  try {
    // ✅ If trying to assign admin role, verify requester is admin
    if (req.body.role) {
      const selectedRole = await Role.findById(req.body.role);
      if (selectedRole?.name?.toLowerCase() === "admin") {
        const jwt = await import("jsonwebtoken");
        const token = req.cookies?.token;
        if (!token) {
          return res.status(403).json({ error: "Only admins can assign admin role" });
        }
        try {
          const decoded = jwt.default.verify(token, process.env.JWT_SECRET);
          const requester = await Staff.findById(decoded.id).populate("role");
          if (requester?.role?.name?.toLowerCase() !== "admin") {
            return res.status(403).json({ error: "Only admins can assign admin role" });
          }
        } catch {
          return res.status(403).json({ error: "Only admins can assign admin role" });
        }
      }
    }

    const updatedStaff = await Staff.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate("role");

    if (!updatedStaff)
      return res.status(404).json({ error: "Staff not found" });

    await sendStaffMail(
      updatedStaff.email,
      `Hello ${updatedStaff.name},\n\nYour profile has been updated by the admin.\n\nIf you did not expect this, please contact support.`
    );

    res.json(updatedStaff);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   DELETE STAFF
========================= */
router.delete("/:id", async (req, res) => {
  try {
    // ✅ Prevent deleting admin accounts if not admin
    const staffToDelete = await Staff.findById(req.params.id).populate("role");
    if (staffToDelete?.role?.name?.toLowerCase() === "admin") {
      const jwt = await import("jsonwebtoken");
      const token = req.cookies?.token;
      if (!token) {
        return res.status(403).json({ error: "Only admins can delete admin accounts" });
      }
      try {
        const decoded = jwt.default.verify(token, process.env.JWT_SECRET);
        const requester = await Staff.findById(decoded.id).populate("role");
        if (requester?.role?.name?.toLowerCase() !== "admin") {
          return res.status(403).json({ error: "Only admins can delete admin accounts" });
        }
      } catch {
        return res.status(403).json({ error: "Only admins can delete admin accounts" });
      }
    }

    const deletedStaff = await Staff.findByIdAndDelete(req.params.id);
    if (!deletedStaff)
      return res.status(404).json({ error: "Staff not found" });

    res.json({ message: "Staff deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   STAFF LOGIN
========================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const staff = await Staff.findOne({ email });
    if (!staff)
      return res.status(404).json({ error: "Staff not found" });

    const isMatch = await bcrypt.compare(password, staff.password);
    if (!isMatch)
      return res.status(401).json({ error: "Invalid password" });

    res.json({
      message: "Login successful",
      staff: {
        id: staff._id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   NOTIFY STAFF (CUSTOM MESSAGE)
========================= */
router.post("/:id/notify", async (req, res) => {
  try {
    const { message } = req.body;

    const staff = await Staff.findById(req.params.id);
    if (!staff)
      return res.status(404).json({ error: "Staff not found" });

    await sendStaffMail(staff.email, message);

    res.json({ message: "Notification sent" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;