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

    const user = await Staff.findOne({ email }).populate({
      path: "role",
      populate: { path: "permissions" },
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcryptjs.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid password" });

    if (!user.role || !user.role.name) {
      return res.status(400).json({ message: "Role not assigned to user" });
    }

    const roleName = user.role.name.toLowerCase();

    const token = jwt.sign(
      { id: user._id, role: roleName },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res
      .cookie("token", token, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
      })
      .status(200)
      .json({
        message: "Login successful",
        data: user,
      });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= LOGOUT ================= */
export const logout = async (req, res) => {
  try {
    res.clearCookie("token", { httpOnly: true, secure: false, sameSite: "lax" });
    res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET PROFILE ================= */
export const getProfile = async (req, res) => {
  try {
    const user = await Staff.findById(req.user.id).populate({
      path: "role",
      populate: { path: "permissions" },
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= UPDATE PROFILE PHOTO ================= */
export const updateProfilePhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const photoPath = `/uploads/images/${req.file.filename}`;

    const user = await Staff.findByIdAndUpdate(
      req.user.id,
      { photo: photoPath },
      { new: true }
    ).populate({ path: "role", populate: { path: "permissions" } });

    res.json({ message: "Photo updated", user });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};
