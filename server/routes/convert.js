const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const ytdlp = require("../services/ytdlp");
const spotify = require("../services/spotify");
const ffmpeg = require("../services/ffmpeg");
const db = require("../services/db");
const { requireAuth } = require("../middleware/auth");
const { checkUsageLimit } = require("../middleware/usageLimit");

const TMP_DIR = process.env.TMP_DIR || "./tmp";

router.post("/", requireAuth, checkUsageLimit, async (req, res) => {
  const { url, platform, speed, amplifyDb, format, title, artist } = req.body;
  if (!url) return res.status(400).json({ error: "url wajib diisi" });

  let rawPath;
  try {
    // Resolve the real downloadable URL (Spotify -> matched YouTube source)
    let downloadUrl = url;
    let meta = { title, artist };
    if (platform === "spotify") {
      const resolved = await spotify.resolve(url);
      downloadUrl = resolved.sourceUrl;
      meta = { title: title || resolved.title, artist: artist || resolved.artist };
    }

    rawPath = await ytdlp.downloadAudio(downloadUrl);

    const outPath = await ffmpeg.process(rawPath, {
      speed: Number(speed) || 1.0,
      amplifyDb: Number(amplifyDb) || 0,
      format: format === "ogg" ? "ogg" : "mp3",
    });

    const stats = fs.statSync(outPath);
    const fileId = path.basename(outPath);

    // count this conversion against the daily quota (paid users are unlimited, see usageLimit.js)
    await db.incrementUsage(req.user.id);

    res.json({
      fileId,
      sizeMb: (stats.size / (1024 * 1024)).toFixed(2),
      title: meta.title || "Untitled",
      artist: meta.artist || "Unknown",
      format: format === "ogg" ? "ogg" : "mp3",
      usage: req.usageInfo,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    // clean up the raw pre-conversion file, keep only the processed output
    if (rawPath && fs.existsSync(rawPath)) {
      fs.unlink(rawPath, () => {});
    }
  }
});

// Lets the frontend download/preview the converted file before uploading.
// Accepts ?name=Judul+Lagu so the downloaded file has a readable filename
// instead of the internal uuid.
router.get("/file/:fileId", requireAuth, (req, res) => {
  const filePath = path.resolve(TMP_DIR, req.params.fileId);
  if (!filePath.startsWith(path.resolve(TMP_DIR))) return res.status(400).end();
  if (!fs.existsSync(filePath)) return res.status(404).end();

  const ext = path.extname(filePath);
  const safeName = (req.query.name || "audio").replace(/[^a-z0-9 _-]/gi, "").trim() || "audio";
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}${ext}"`);
  res.sendFile(path.resolve(filePath));
});

module.exports = router;
