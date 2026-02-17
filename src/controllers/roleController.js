import Role from "../models/Role.js";

// GET all active roles
export const getRoles = async (req, res) => {
  try {
    const roles = await Role.find({ status: 1 }); // only active
    res.json(roles);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch roles" });
  }
};

// GET single role
export const getRoleById = async (req, res) => {
  try {
    const { id } = req.params;
    const role = await Role.findById(id);
    res.json(role);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch role" });
  }
};

// CREATE role
export const createRole = async (req, res) => {
  try {
    const { name, permissions } = req.body;

    if (!name) return res.status(400).json({ error: "Role name is required" });

    // Prevent duplicate
    const existingRole = await Role.findOne({ name });
    if (existingRole) return res.status(400).json({ error: "Role already exists" });

    const role = await Role.create({ name, permissions });
    res.status(201).json(role);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create role" });
  }
};

// UPDATE role
export const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, permissions, status } = req.body;

    const role = await Role.findByIdAndUpdate(
      id,
      { name, permissions, status },
      { new: true }
    );

    res.json(role);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update role" });
  }
};

// DELETE role (soft delete)
export const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;

    // Optional: Prevent deleting ADMIN role
    const role = await Role.findById(id);
    if (!role) return res.status(404).json({ error: "Role not found" });
    if (role.name === "ADMIN") return res.status(400).json({ error: "Cannot delete ADMIN role" });

    role.status = 0;
    await role.save();

    res.json({ message: "Role deleted", role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete role" });
  }
};
