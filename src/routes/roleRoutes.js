import express from "express";
import Role from "../models/Role.js";
import { logAudit } from "../utils/logAudit.js";
import { protect } from "../middleware/auth.js";

// NOTE: We keep the original getRoles/getRoleById from roleController for reads
// and add logAudit directly to write operations here
import {
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
} from "../controllers/roleController.js";

const roleRoutes = express.Router();

// ── Reads (no audit needed) ───────────────────────────────────────────────────
roleRoutes.get("/",    getRoles);
roleRoutes.get("/:id", getRoleById);

// ── CREATE ────────────────────────────────────────────────────────────────────
roleRoutes.post("/create", protect, async (req, res, next) => {
  // Store original res.json to intercept
  const originalJson = res.json.bind(res);
  res.json = async (data) => {
    if (res.statusCode < 400 && data?._id) {
      await logAudit(req, "Role", "CREATE",
        `Created role "${data.name}"`,
        { entityId: data._id?.toString(), entityName: data.name }
      );
    }
    return originalJson(data);
  };
  return createRole(req, res, next);
});

// ── UPDATE ────────────────────────────────────────────────────────────────────
roleRoutes.put("/:id", protect, async (req, res, next) => {
  const before = await Role.findById(req.params.id).select("name permissions").lean();
  const originalJson = res.json.bind(res);
  res.json = async (data) => {
    if (res.statusCode < 400 && data) {
      await logAudit(req, "Role", "UPDATE",
        `Updated role "${data.name || req.params.id}"`,
        { entityId: req.params.id, entityName: data.name, before }
      );
    }
    return originalJson(data);
  };
  return updateRole(req, res, next);
});

// ── DELETE ────────────────────────────────────────────────────────────────────
roleRoutes.delete("/:id", protect, async (req, res, next) => {
  const role = await Role.findById(req.params.id).select("name").lean();
  const roleName = role?.name || req.params.id;
  const originalJson = res.json.bind(res);
  res.json = async (data) => {
    if (res.statusCode < 400) {
      await logAudit(req, "Role", "DELETE",
        `Deleted role "${roleName}"`,
        { entityId: req.params.id, entityName: roleName }
      );
    }
    return originalJson(data);
  };
  return deleteRole(req, res, next);
});

export default roleRoutes;