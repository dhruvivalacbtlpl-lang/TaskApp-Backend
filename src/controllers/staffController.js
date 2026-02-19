import Staff from "../models/Staff.js";
import Role from "../models/Role.js";
import bcryptjs from "bcryptjs";
import { sendStaffMail } from "../utils/mailer.js";

// Get all staff
export const getAllStaff = async (req, res) => {
  try {
    const staffs = await Staff.find().populate("role", "name permissions");
    res.json(staffs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Create new staff
export const createStaff = async (req, res) => {
  try {
    let { name, email, mobile, roleName, password } = req.body;

    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    if (!roleName) roleName = "STAFF";

    if (roleName === "ADMIN" && req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Only admin can assign ADMIN role" });
    }

    const role = await Role.findOne({ name: roleName });
    if (!role) {
      return res.status(400).json({ message: "Role not found" });
    }

    const hashedPassword = await bcryptjs.hash(password, 10);

    const newStaff = await Staff.create({
      name,
      email,
      mobile,
      password: hashedPassword,
      role: role._id,
    });

    // ✅ Send email with plain password
    await sendStaffMail(email, password);

    res.status(201).json(newStaff);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update staff
export const updateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    let { name, email, mobile, roleName } = req.body;

    let updateData = { name, email, mobile };

    if (roleName) {
      if (roleName === "ADMIN" && req.user.role !== "ADMIN") {
        return res.status(403).json({ message: "Only admin can assign ADMIN role" });
      }

      const role = await Role.findOne({ name: roleName });
      if (!role) return res.status(400).json({ message: "Role not found" });

      updateData.role = role._id;
    }

    const updatedStaff = await Staff.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).populate("role", "name permissions");

    res.json(updatedStaff);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete staff
export const deleteStaff = async (req, res) => {
  try {
    const { id } = req.params;
    await Staff.findByIdAndDelete(id);
    res.json({ message: "Staff deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};