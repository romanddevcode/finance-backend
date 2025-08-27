import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || ""; // Храни в .env

app.use(cors());
app.use(express.json());

// Подключение к MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    dbName: "financeApp",
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

// Модель пользователя
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", UserSchema);

const SettingSchema = new mongoose.Schema({
  key: { type: String, required: true },
  value: { type: Number, required: true },
  isActivated: { type: Boolean, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
});
SettingSchema.index({ userId: 1, key: 1 }, { unique: true });

const Setting = mongoose.model("Setting", SettingSchema);

// Модель транзакции
const TransactionSchema = new mongoose.Schema({
  id: String,
  amount: Number,
  type: String,
  category: String,
  currency: String,
  date: String,
  description: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
});

const Transaction = mongoose.model("Transaction", TransactionSchema);

const GoalSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  targetAmount: { type: Number, required: true }, // теперь это поле приходит с клиента
  currentAmount: { type: Number, default: 0 },
  currency: { type: String, default: "EUR" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
});

const Goal = mongoose.model("Goal", GoalSchema);

// Middleware для проверки JWT
const authMiddleware = async (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log("Decoded token:", { userId: decoded.userId });
    req.user = await User.findById(decoded.userId);
    if (!req.user) {
      return res.status(401).json({ error: "Invalid token" });
    }
    console.log("Authenticated user:", { userId: req.user.id });
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// Регистрация
app.post("/api/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword });
    await user.save();

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "1h",
    });
    res.status(201).json({ token, user: { id: user.id, email } });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Failed to register" });
  }
});

// Логин
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({ token, user: { id: user.id, email } });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Failed to login" });
  }
});

// Получение всех транзакций (только для авторизованного пользователя)
app.get("/api/transactions", authMiddleware, async (req, res) => {
  try {
    const all = await Transaction.find({ userId: req.user.id });
    res.json(all);
  } catch (err) {
    console.error("Error fetching transactions:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// Создание новой транзакции (только для авторизованного пользователя)
app.post("/api/transactions", authMiddleware, async (req, res) => {
  try {
    const tx = new Transaction({ ...req.body, userId: req.user.id });
    await tx.save();
    res.status(201).json(tx);
  } catch (err) {
    console.error("Error creating transaction:", err);
    res.status(400).json({ error: "Failed to create transaction" });
  }
});

// Удаление транзакции по id (кастомному)
app.delete("/api/transactions/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Transaction.findOneAndDelete({
      id: id,
      userId: req.user.id,
    });

    if (!deleted) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    return res.status(204).end();
  } catch (err) {
    console.error("Error deleting transaction:", err);
    return res.status(500).json({ error: "Failed to delete transaction" });
  }
});

//Получіть цель
app.get("/api/goals", authMiddleware, async (req, res) => {
  res.json(await Goal.find({ userId: req.user.id }));
});

app.post("/api/goals", authMiddleware, async (req, res) => {
  const goal = new Goal({ ...req.body, userId: req.user.id });
  await goal.save();
  res.status(201).json(goal);
});

//удаление цели
app.delete("/api/goals/:id", authMiddleware, async (req, res) => {
  await Goal.deleteOne({ id: req.params.id, userId: req.user.id });
  res.status(204).end();
});

app.patch("/api/goals/:id", authMiddleware, async (req, res) => {
  const goal = await Goal.findOneAndUpdate(
    { id: req.params.id, userId: req.user.id },
    req.body,
    { new: true }
  );
  сonsole.log(goal);
  res.json(goal);
});

app.post("/api/budgetsettings", authMiddleware, async (req, res) => {
  const { limit, isLimitActive } = req.body;

  try {
    const setting = await Setting.findOneAndUpdate(
      { key: "budgetLimit", userId: req.user.id },
      { value: { limit, isLimitActive } },
      { new: true, upsert: true } // <- создаст новый, если нет
    );

    res.status(200).json(setting);
  } catch (err) {
    console.error("Error saving budget settings:", err);
    res.status(500).json({ error: "Failed to save budget settings" });
  }
});

app.get("/api/budgetsettings", authMiddleware, async (req, res) => {
  try {
    const setting = await Setting.findOne({
      key: "budgetLimit",
      userId: req.user.id,
    });

    if (!setting) {
      return res.status(404).json({ error: "Budget settings not found" });
    }

    // `value` должен быть объектом с limit и isLimitActive
    res.status(200).json(setting.value);
  } catch (err) {
    console.error("Error fetching budget settings:", err);
    res.status(500).json({ error: "Failed to fetch budget settings" });
  }
});

// Вместо app.put — или в дополнение к нему

// Запуск сервера
app.listen(PORT, () => console.log(`Server started on ${PORT}`));
