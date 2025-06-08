import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema({
  amount: Number,
  type: String,
  category: String,
  date: String,
  description: String,
});

export default mongoose.model("Transaction", TransactionSchema);
