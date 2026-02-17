import express from "express";
import {
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole
} from "../controllers/roleController.js";

const roleRoutes = express.Router();

// Role CRUD
roleRoutes.get("/", getRoles);
roleRoutes.get("/:id", getRoleById); 
roleRoutes.post("/create", createRole);
roleRoutes.put("/:id", updateRole);
roleRoutes.delete("/:id", deleteRole);

export default roleRoutes;
