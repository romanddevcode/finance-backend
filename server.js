import express from "express";
import cors from "cors";
import mongoose from "mongoose";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI || "", {
  dbName: "financeApp",
});

const TransactionSchema = new mongoose.Schema({
  id: String,
  amount: Number,
  type: String,
  category: String,
  date: String,
  description: String,
});

const Transaction = mongoose.model("Transaction", TransactionSchema);

app.get("/api/transactions", async (_, res) => {
  const all = await Transaction.find();
  res.json(all);
});

app.post("/api/transactions", async (req, res) => {
  const tx = new Transaction(req.body);
  await tx.save();
  res.status(201).json(tx);
});

app.listen(PORT, () => console.log(`Server started on ${PORT}`));
