import express      from "express";
import jwt          from "jsonwebtoken";
import Staff        from "../models/Staff.js";
import { login, logout } from "../controllers/authController.js";

const authRoutes = express.Router();

/* ================= LOGIN ================= */
authRoutes.post("/login", login);

/* ================= LOGOUT ================= */
authRoutes.post("/logout", logout);

/* ================= GET PROFILE ================= */
authRoutes.get("/profile", async (req, res) => {
  try {
    // ✅ cookieParser is now registered before routes, so req.cookies works
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const staff = await Staff.findById(decoded.id)
      .populate("role")
      .select("-password");

    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    res.status(200).json(staff);
  } catch (err) {
    console.error("Profile error:", err.message);
    res.status(401).json({ message: "Invalid or expired token" });
  }
});

/* ================= UPDATE PROFILE ================= */
authRoutes.put("/profile", async (req, res) => {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { name, email, mobile } = req.body;

    const updatedStaff = await Staff.findByIdAndUpdate(
      decoded.id,
      { name, email, mobile },
      { new: true, runValidators: true }
    )
      .populate("role")
      .select("-password");

    if (!updatedStaff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    res.status(200).json(updatedStaff);
  } catch (err) {
    res.status(500).json({ message: "Failed to update profile", error: err.message });
  }
});

export default authRoutes;