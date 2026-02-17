import bcrypt from "bcryptjs";
import Staff from "../models/Staff.js";
import Role from "../models/Role.js";

const createAdmin = async () => {
  try {
    let adminRole = await Role.findOne({ name: "ADMIN" });

    if (!adminRole) {
      adminRole = await Role.create({
        name: "ADMIN",
        permissions: ["ALL_ACCESS"],
      });
      console.log("✅ ADMIN role created");
    }

    const adminExists = await Staff.findOne({
      email: "admin@taskapp.com",
    });

    if (adminExists) {
      console.log("✅ Admin already exists");
      return;
    }

    const hashedPassword = await bcrypt.hash("Admin@123", 10);

    await Staff.create({
      name: "Super Admin",
      email: "admin@taskapp.com",
      mobile: "9999999999",
      password: hashedPassword,
      role: adminRole._id,
      status: 1,
    });

    console.log("🚀 Admin created successfully");
  } catch (error) {
    console.error("❌ Error creating admin:", error.message);
  }
};

export default createAdmin;
