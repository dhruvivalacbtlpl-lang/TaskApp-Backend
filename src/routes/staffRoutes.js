import express from "express";
import Staff from "../models/Staff.js";
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

    // SEND EMAIL WITH LOGIN CREDENTIALS
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
    const updatedStaff = await Staff.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate("role");

    if (!updatedStaff)
      return res.status(404).json({ error: "Staff not found" });

    // SEND EMAIL NOTIFYING PROFILE UPDATE
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
