const express = require("express");
const router = express.Router();
const { v4: uuid } = require("uuid");
const db = require("../services/db");
const payment = require("../services/payment");
const { requireAuth } = require("../middleware/auth");

// Start a checkout — returns a Midtrans Snap token/redirect_url for the frontend
router.post("/checkout", requireAuth, async (req, res) => {
  const { plan } = req.body; // "monthly" | "yearly"
  try {
    const orderId = `ORDER-${req.user.id.slice(0, 8)}-${Date.now()}`;
    const tx = await payment.createTransaction({
      orderId,
      plan,
      customer: { email: req.user.email || `${req.user.discordId}@discord.local`, name: req.user.username },
    });

    await db.insertPayment({
      orderId,
      userId: req.user.id,
      plan,
      amount: tx.amount,
      days: tx.days,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    res.json({ token: tx.token, redirectUrl: tx.redirect_url, orderId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Midtrans calls this server-to-server after a payment status changes.
// Must stay unauthenticated (Midtrans doesn't send our JWT) but signature-verified.
router.post("/webhook", async (req, res) => {
  const body = req.body;
  try {
    const valid = payment.verifySignature(body);
    if (!valid) return res.status(400).json({ error: "Invalid signature" });

    const { order_id, transaction_status, fraud_status } = body;
    const isSuccess =
      transaction_status === "settlement" ||
      (transaction_status === "capture" && fraud_status === "accept");

    if (isSuccess) {
      const paymentRecord = db.getPayments().find((p) => p.orderId === order_id);
      if (paymentRecord && paymentRecord.status !== "paid") {
        await db.updatePaymentByOrderId(order_id, { status: "paid", paidAt: new Date().toISOString() });

        const user = db.findUserById(paymentRecord.userId);
        if (user) {
          const currentExpiry = user.paidUntil && new Date(user.paidUntil) > new Date()
            ? new Date(user.paidUntil)
            : new Date();
          currentExpiry.setDate(currentExpiry.getDate() + paymentRecord.days);
          await db.updateUser(user.id, { tier: "paid", paidUntil: currentExpiry.toISOString() });
        }
      }
    } else if (["deny", "cancel", "expire"].includes(transaction_status)) {
      await db.updatePaymentByOrderId(order_id, { status: transaction_status });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Frontend polls this after redirect back from Snap to see if it's confirmed yet
router.get("/status/:orderId", requireAuth, (req, res) => {
  const record = db.getPayments().find((p) => p.orderId === req.params.orderId && p.userId === req.user.id);
  if (!record) return res.status(404).json({ error: "Order tidak ditemukan" });
  res.json({ status: record.status });
});

router.get("/plans", (req, res) => {
  res.json({ plans: payment.PLANS });
});

// Client key is safe to expose publicly (that's what it's for) — the
// frontend needs it to load Midtrans' Snap.js popup script.
router.get("/config", (req, res) => {
  res.json({
    clientKey: process.env.MIDTRANS_CLIENT_KEY || "",
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  });
});

module.exports = router;
