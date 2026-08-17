const db = require("../services/db");

const FREE_DAILY_LIMIT = Number(process.env.FREE_DAILY_LIMIT || 2);

function isPaidActive(user) {
  if (user.tier !== "paid") return false;
  if (!user.paidUntil) return true; // no expiry set = lifetime/manual grant
  return new Date(user.paidUntil) > new Date();
}

async function checkUsageLimit(req, res, next) {
  const user = req.user;
  const paidActive = isPaidActive(user);

  if (paidActive) {
    req.usageInfo = { tier: "paid", used: null, limit: null, remaining: null };
    return next();
  }

  // paid expired -> silently treat as free from here on (admin panel still shows real tier)
  const usedToday = db.getUsageToday(user.id);
  if (usedToday >= FREE_DAILY_LIMIT) {
    return res.status(429).json({
      error: `Limit gratis ${FREE_DAILY_LIMIT}x/hari sudah habis. Upgrade ke Premium buat unlimited, atau coba lagi besok.`,
      limitReached: true,
      used: usedToday,
      limit: FREE_DAILY_LIMIT,
    });
  }

  req.usageInfo = {
    tier: "free",
    used: usedToday,
    limit: FREE_DAILY_LIMIT,
    remaining: FREE_DAILY_LIMIT - usedToday,
  };
  next();
}

module.exports = { checkUsageLimit, isPaidActive, FREE_DAILY_LIMIT };
