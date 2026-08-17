const express = require("express");
const router = express.Router();
const ytdlp = require("../services/ytdlp");
const spotify = require("../services/spotify");
const { requireAuth } = require("../middleware/auth");

router.post("/", requireAuth, async (req, res) => {
  const { url, platform } = req.body;
  if (!url) return res.status(400).json({ error: "url wajib diisi" });

  try {
    let track;
    if (platform === "spotify") {
      track = await spotify.resolve(url);
    } else {
      // default: youtube
      track = await ytdlp.getInfo(url);
    }
    res.json({ track });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
