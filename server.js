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

const refreshTokenSchema = new mongoose.Schema({
  token: { type: String, required: true },
  userId: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});

export const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);

const SettingsLimitSchema = new mongoose.Schema({
  id: { type: String, required: true },
  value: { type: Number, required: true },
  isActivated: { type: Boolean, required: true },
  currency: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
});
SettingsLimitSchema.index({ userId: 1, id: 1 }, { unique: true });

const SettingsLimit = mongoose.model("Setting", SettingsLimitSchema);

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


const generateTokens = async (userId) => {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "1h" });
  const refreshToken = jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: "7d" });

  // сохраняем refresh в базу
  await RefreshToken.create({
    token: refreshToken,
    userId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 дней
  });

  return { accessToken, refreshToken };
};

// Регистрация
app.post("/api/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "Email already in use" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword });
    await user.save();

    const { accessToken, refreshToken } = await generateTokens(user.id);

    res.status(201).json({ accessToken, refreshToken, user: { id: user.id, email } });
  } catch (err) {
    res.status(500).json({ error: "Failed to register" });
  }
});

// Логин
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const { accessToken, refreshToken } = await generateTokens(user.id);

    res.json({ accessToken, refreshToken, user: { id: user.id, email } });
  } catch (err) {
    res.status(500).json({ error: "Failed to login" });
  }
});

app.post("/api/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: "No refresh token" });

  try {
    const stored = await RefreshToken.findOne({ token: refreshToken });
    if (!stored || stored.expiresAt < new Date()) {
      return res.status(401).json({ error: "Refresh token expired" });
    }

    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    const { accessToken, refreshToken: newRefreshToken } = await generateTokens(decoded.userId);

    // Удаляем старый refresh и пишем новый
    await RefreshToken.deleteOne({ token: refreshToken });

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

app.post("/api/logout", async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await RefreshToken.deleteOne({ token: refreshToken });
  }
  res.json({ message: "Logged out" });
});

// Получение всех транзакций (только для авторизованного пользователя)
app.get("/api/transactions", authMiddleware, async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user.id });

    const cleaned = transactions.map(tx => ({
      id: tx._id.toString(),
      amount: tx.amount,
      currency: tx.currency,
      category: tx.category,
      type: tx.type,
      description: tx.description,
      date: tx.date,
    }));

    res.status(200).json(cleaned);
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
    const deleted = await Transaction.findOneAndDelete({
      _id: req.params.id, // ищем по Mongo _id
      userId: req.user.id,
    });

    if (!deleted) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    res.status(200).json({ id: req.params.id });
  } catch (err) {
    console.error("Error deleting transaction:", err);
    res.status(500).json({ error: "Failed to delete transaction" });
  }
});

//Получіть цель
app.get("/api/goals", authMiddleware, async (req, res) => {
  const goals = await Goal.find({ userId: req.user.id }).lean();
  const formatted = goals.map(g => ({
    id: g._id,
    title: g.title,
    targetAmount: g.targetAmount,
    currentAmount: g.currentAmount,
    currency: g.currency,
  }));
  res.json(formatted);
});

app.post("/api/goals", authMiddleware, async (req, res) => {
  const goal = new Goal({ ...req.body, userId: req.user.id });
  await goal.save();
  res.status(201).json({
    id: goal._id,
    title: goal.title,
    targetAmount: goal.targetAmount,
    currentAmount: goal.currentAmount,
    currency: goal.currency,
  });
});

//удаление цели
app.delete("/api/goals/:id", authMiddleware, async (req, res) => {
  await Goal.deleteOne({ _id: req.params.id, userId: req.user.id });
  res.status(204).end();
});

// Обновление цели
app.patch("/api/goals/:id", authMiddleware, async (req, res) => {
  const goal = await Goal.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    req.body,
    { new: true }
  );
  if (!goal) return res.status(404).json({ message: "Goal not found" });

  res.json({
    id: goal._id,
    title: goal.title,
    targetAmount: goal.targetAmount,
    currentAmount: goal.currentAmount,
    currency: goal.currency,
  });
});

app.put("/api/budgetsettings", authMiddleware, async (req, res) => {
  try {
    const newSettingsLimit = await SettingsLimit.findOneAndUpdate(
      { userId: req.user.id },
      req.body,
      { new: true, upsert: true }
    );

    // Если документ вдруг не создался, возвращаем ошибку
    if (!newSettingsLimit) {
      return res.status(500).json({ error: "Failed to save budget settings" });
    }

    const cleaned = {
      id: newSettingsLimit._id.toString(),
      value: newSettingsLimit.value,
      currency: newSettingsLimit.currency,
      isActivated: newSettingsLimit.isActivated,
    };

    res.status(200).json(cleaned);
  } catch (err) {
    console.error("Error saving budget settings:", err);
    res.status(500).json({ error: "Failed to save budget settings" });
  }
});

app.get("/api/budgetsettings", authMiddleware, async (req, res) => {
  try {
    const settings = await SettingsLimit.findOne({ userId: req.user.id });

    if (!settings) {
      return res.json(null); 
    }

    const cleaned = {
      id: settings._id.toString(),
      value: settings.value,
      currency: settings.currency,
      isActivated: settings.isActivated,
    };

    res.json(cleaned);
  } catch (err) {
    console.error("Error fetching budget settings:", err);
    res.status(500).json({ error: "Failed to fetch budget settings" });
  }
});

// Запуск сервера
app.listen(PORT, () => console.log(`Server started on ${PORT}`));
