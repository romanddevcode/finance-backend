import express from "express";
import Transaction from "../models/Transaction.js";

const router = express.Router();

// GET all
router.get("/", async (req, res) => {
  const data = await Transaction.find();
  res.json(data);
});

// POST new
router.post("/", async (req, res) => {
  const tx = new Transaction(req.body);
  await tx.save();
  res.status(201).json(tx);
});

// DELETE by id
router.delete("/:id", async (req, res) => {
  await Transaction.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

export default router;
