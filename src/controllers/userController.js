import User from "../models/User.js";
import bcrypt from "bcryptjs";
import { sendStaffMail } from "../services/mail.js";

export const getAllStaff = async (req, res) => {
  try {
    const staff = await User.find({ role: "staff" });
    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createStaff = async (req, res) => {
  try {
    const { name, email, mobile } = req.body;

    if (!name || !email || !mobile) {
      return res.status(400).json({ error: "Name, email, and mobile are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "Email already exists" });

    const defaultPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    const user = await User.create({
      name, email, mobile, password: hashedPassword, role: "staff", status: 1,
    });

    await sendStaffMail(email, defaultPassword);

    res.status(201).json({
      message: `Staff created successfully. Login credentials sent to ${email}.`,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const updateStaff = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteStaff = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "Staff deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const toggleStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    user.status = user.status === 1 ? 0 : 1;
    await user.save();
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
