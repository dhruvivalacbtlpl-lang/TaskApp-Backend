  import mongoose from "mongoose";
  import Role from "../models/Role.js";

  mongoose.connect("mongodb://localhost:27017/yourDB", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const seedRoles = async () => {
    await Role.deleteMany({});

    // Admin with ALL_ACCESS
    await Role.create({ name: "ADMIN", permissions: ["ALL_ACCESS"] });

    // Staff with limited permission
    await Role.create({ name: "STAFF", permissions: ["view_staff"] });

    console.log("Roles created successfully!");
    mongoose.disconnect();
  };

  seedRoles();
