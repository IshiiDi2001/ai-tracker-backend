const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();

app.set("trust proxy", 1);

// ✅ CORS FIRST
app.use(
  cors({
    origin: true, // reflect request origin
    methods: ["GET", "POST"], // OPTIONS handled automatically
    allowedHeaders: ["Content-Type"],
  })
);

// ✅ IMPORTANT: explicitly allow preflight
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
app.use(express.json()); // parse JSON bodies
app.use(express.static("public")); // serve static files (if any)
app.set("view engine", "ejs"); // set EJS as view engine

// ---------------- MONGO CONNECTION ----------------
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// ---------------- SCHEMA ----------------
const sessionSchema = new mongoose.Schema({
  sessionStart: Date,
  sessionEnd: Date,
  userCount: Number,
  categories: Object,
  ipAddress: String,
});

const Session = mongoose.model("Session", sessionSchema);

// ---------------- ROUTES ----------------

// Dashboard route
app.get("/", async (req, res) => {
  try {
    const sessions = await Session.find().sort({ sessionStart: 1 });

    // Map IPs to user numbers and calculate per-user totals
    const userMap = {};
    let userCounter = 1;
    const users = {};

    const sessionsWithUserNo = sessions.map((s) => {
      const ip = s.ipAddress;

      if (!userMap[ip]) {
        userMap[ip] = userCounter++;
        users[userMap[ip]] = {
          userNo: userMap[ip],
          categories: {
            IDEA_GENERATION: 0,
            REFINEMENT: 0,
            INFORMATION: 0,
            COGNITIVE: 0,
            OTHER: 0,
          },
        };
      }

      // accumulate totals per user
      for (const key in s.categories) {
        users[userMap[ip]].categories[key] += s.categories[key];
      }

      return {
        ...s.toObject(),
        userNo: userMap[ip],
      };
    });

    res.render("index", {
      sessions: sessionsWithUserNo, // session-wise
      users: Object.values(users), // user-wise totals
    });
  } catch (err) {
    res.send("Dashboard error: " + err.message);
  }
});

app.get("/my-analytics", async (req, res) => {
  try {
    // detect user IP automatically
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    // fetch sessions only for this IP
    const sessions = await Session.find({ ipAddress: ip }).sort({
      sessionStart: 1,
    });

    // calculate totals for pie chart
    const totalCategories = {
      IDEA_GENERATION: 0,
      REFINEMENT: 0,
      INFORMATION: 0,
      COGNITIVE: 0,
      OTHER: 0,
    };

    sessions.forEach((s) => {
      for (const key in s.categories) {
        totalCategories[key] += s.categories[key];
      }
    });

    res.render("myAnalytics", {
      sessions,
      totalCategories,
    });
  } catch (err) {
    res.send("Error loading analytics: " + err.message);
  }
});

// Save session from extension
app.post("/api/sessions", async (req, res) => {
  try {
    const { sessionStart, sessionEnd, userCount, categories } = req.body;

    // detect user IP automatically
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    const session = new Session({
      sessionStart,
      sessionEnd,
      userCount,
      categories,
      ipAddress: ip,
    });

    await session.save();

    res.status(200).json({ message: "Session saved successfully" });
  } catch (err) {
    console.error("Error saving session:", err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
