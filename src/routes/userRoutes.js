import express from "express";
import {
  getAllStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  toggleStatus
} from "../controllers/UserController.js";

const router = express.Router();

router.get("/all", getAllStaff);
router.post("/create", createStaff);
router.patch("/update/:id", updateStaff);
router.delete("/delete/:id", deleteStaff);
router.patch("/toggle-status/:id", toggleStatus);

export default router;
