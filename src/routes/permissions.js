import express from "express";
import Permission from "../models/Permission.js";

const router = express.Router();

/* CREATE */
router.post("/", async (req, res) => {
  try {
    const { name, status } = req.body;

    const newPermission = new Permission({
      name,
      value: name.toLowerCase().replace(/\s+/g, "_"),
      status
    });

    await newPermission.save();
    res.status(201).json(newPermission);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* GET ALL */
router.get("/", async (req, res) => {
  try {
    const data = await Permission.find();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* GET SINGLE */
router.get("/:id", async (req, res) => {
  try {
    const data = await Permission.findById(req.params.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* UPDATE */
router.put("/:id", async (req, res) => {
  try {
    const { name, status } = req.body;

    const updated = await Permission.findByIdAndUpdate(
      req.params.id,
      {
        name,
        value: name.toLowerCase().replace(/\s+/g, "_"),
        status
      },
      { new: true }
    );

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* DELETE */
router.delete("/:id", async (req, res) => {
  try {
    await Permission.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted Successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
