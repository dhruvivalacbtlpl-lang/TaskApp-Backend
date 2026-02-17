import bcryptjs from "bcryptjs";
import Staff from "../models/Staff.js";
import jwt from "jsonwebtoken";

/* ================= LOGIN ================= */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    // Find user & populate role
    const user = await Staff.findOne({ email }).populate("role");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Compare password
    const isMatch = await bcryptjs.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // Role safety check
    if (!user.role || !user.role.name) {
      return res.status(400).json({ message: "Role not assigned to user" });
    }

    // Normalize role (important)
    const roleName = user.role.name.toLowerCase();

    // Create JWT
    const token = jwt.sign(
      {
        id: user._id,
        role: roleName,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Send cookie
    res
      .cookie("token", token, {
        httpOnly: true,
        secure: false, // change to true in production (HTTPS)
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000, // 1 day
      })
      .status(200)
      .json({
        message: "Login successful",
        data: user ,
      });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


/* ================= LOGOUT ================= */
export const logout = async (req, res) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });

    res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

