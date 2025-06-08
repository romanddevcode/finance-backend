import express from "express";
import cors from "cors";
import mongoose from "mongoose";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Подключение к MongoDB
mongoose
  .connect(process.env.MONGODB_URI || "", {
    dbName: "financeApp",
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Схема и модель
const TransactionSchema = new mongoose.Schema({
  id: String,
  amount: Number,
  type: String,
  category: String,
  date: String,
  description: String,
});

const Transaction = mongoose.model("Transaction", TransactionSchema);

// Получение всех транзакций
app.get("/api/transactions", async (_, res) => {
  try {
    const all = await Transaction.find();
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// Создание новой транзакции
app.post("/api/transactions", async (req, res) => {
  try {
    const tx = new Transaction(req.body);
    await tx.save();
    res.status(201).json(tx);
  } catch (err) {
    res.status(400).json({ error: "Failed to create transaction" });
  }
});

// Запуск сервера
app.listen(PORT, () => console.log(`Server started on ${PORT}`));
