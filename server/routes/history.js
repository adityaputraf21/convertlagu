const express = require("express");
const router = express.Router();
const db = require("../services/db");
const { requireAuth } = require("../middleware/auth");
const { checkOperation } = require("../services/robloxUpload");

router.get("/", requireAuth, (req, res) => {
  const history = db.getUploadHistory(req.user.id, 200);
  res.json({ history });
});

// CSV export: Title, Artist, Asset ID, Format, Size, Status, Uploaded At
router.get("/export.csv", requireAuth, (req, res) => {
  const history = db.getUploadHistory(req.user.id, 1000);

  const escapeCsv = (value) => {
    const str = String(value ?? "");
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const header = ["Title", "Artist", "Asset ID", "Format", "Size (MB)", "Status", "Uploaded At"];
  const rows = history.map((h) =>
    [h.title, h.artist || "", h.assetId || "", h.format || "", h.sizeMb || "", h.status || "active", h.createdAt]
      .map(escapeCsv)
      .join(",")
  );
  const csv = [header.join(","), ...rows].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="audio-history-${db.todayKey()}.csv"`);
  res.send(csv);
});

// Re-poll Roblox for a record that was left "pending" (moderation still in progress)
router.post("/:id/recheck", requireAuth, async (req, res) => {
  const { apiKey } = req.body;
  const record = db.findUploadRecordById(req.params.id);
  if (!record || record.userId !== req.user.id) return res.status(404).json({ error: "Record tidak ditemukan" });
  if (record.status !== "pending" || !record.operationId) {
    return res.json({ record }); // nothing to recheck, already resolved
  }

  const key = apiKey || process.env.ROBLOX_API_KEY;
  if (!key) return res.status(400).json({ error: "API Key Roblox dibutuhkan buat re-check status" });

  try {
    const result = await checkOperation(record.operationId, key);
    const updated = await db.updateUploadRecord(record.id, {
      assetId: result.assetId || record.assetId,
      status: result.pending ? "pending" : "active",
    });
    res.json({ record: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
