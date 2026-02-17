import express from "express";
import jwt from "jsonwebtoken";
import Staff from "../models/Staff.js";
import { login, logout } from "../controllers/authController.js"; // ✅ FIXED

const authRoutes = express.Router();

/* ================= LOGIN ================= */
authRoutes.post("/login", login);

/* ================= LOGOUT ================= */
authRoutes.post("/logout", logout);

/* ================= PROFILE ================= */
authRoutes.get("/profile", async (req, res) => {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const staff = await Staff.findById(decoded.id).populate("role").select("-password");

    if (!staff) {   
      return res.status(404).json({ message: "Staff not found" });
    }

    res.status(200).json(staff);

  } catch (err) {
    res.status(401).json({ message: "Invalid token" });
  }
});

export default authRoutes;
