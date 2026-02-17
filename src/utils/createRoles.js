import Role from "../models/Role.js";

export const createRolesIfNotExist = async () => {
  try {
    const adminRole = await Role.findOne({ name: "ADMIN" });
    const staffRole = await Role.findOne({ name: "STAFF" });

    if (!adminRole) {
      await Role.create({
        name: "ADMIN",
        permissions: ["ALL_ACCESS"],
      });
      console.log("ADMIN role created");
    }

    if (!staffRole) {
      await Role.create({
        name: "STAFF",
        permissions: ["view_staff"],
      });
      console.log("STAFF role created");
    }
  } catch (err) {
    console.error("Error creating roles:", err);
  }
};
