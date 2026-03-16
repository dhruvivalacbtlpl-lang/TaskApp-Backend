import bcrypt from "bcryptjs";
import Staff from "../models/Staff.js";

/**
 * Creates the SuperAdmin account.
 * SuperAdmin has NO company — they exist above all companies.
 * Login is done WITHOUT a companyName field (handled separately in authController).
 */
const createAdmin = async () => {
  try {
    const adminExists = await Staff.findOne({ email: "admin@taskapp.com" });

    if (adminExists) {
      console.log("✅ SuperAdmin already exists");
      return;
    }

    const hashedPassword = await bcrypt.hash("Admin@123", 10);

    await Staff.create({
      name: "Super Admin",
      email: "admin@taskapp.com",
      mobile: "9999999999",
      password: hashedPassword,
      role: null,           // SuperAdmin needs no role
      company: undefined,   // SuperAdmin belongs to no company
      isOwner: false,
      isSuperAdmin: true,   // ← Key flag
    });

    console.log("🚀 SuperAdmin created successfully → admin@taskapp.com / Admin@123");
  } catch (error) {
    console.error("❌ Error creating admin:", error.message);
  }
};

export default createAdmin;