require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const path = require("path");

const TMP_DIR = process.env.TMP_DIR || "./tmp";
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/payment", require("./routes/payment"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/resolve", require("./routes/resolve"));
app.use("/api/convert", require("./routes/convert"));
app.use("/api/upload", require("./routes/upload"));
app.use("/api/history", require("./routes/history"));

app.get("/api/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Roblox Audio Converter jalan di http://localhost:${PORT}`);
  console.log(`Pastikan yt-dlp dan ffmpeg sudah terinstall di PATH.`);
});
