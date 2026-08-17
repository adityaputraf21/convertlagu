const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { v4: uuid } = require("uuid");

const TMP_DIR = process.env.TMP_DIR || "./tmp";

// YouTube's anti-bot measures change constantly and differ per-client. Rather
// than making the person hunt down fresh cookies every time, we automatically
// retry a failed (403-style) request against several of YouTube's other
// client "personas" — this is the same fallback community consensus
// recommends (see yt-dlp wiki/issue tracker) and resolves most 403s without
// any manual setup.
const PLAYER_CLIENT_FALLBACKS = [
  null, // first try: whatever the person configured (or yt-dlp's own default)
  "android",
  "android,web",
  "tv",
  "mweb",
];

// User-configurable overrides — see .env.example.
// YTDLP_COOKIES_FROM_BROWSER=chrome — authenticate as a real logged-in
// browser session; still the most reliable single fix if auto-fallback fails.
// YTDLP_EXTRA_ARGS="..." — any other flags appended to every yt-dlp call.
function userArgs() {
  const args = [];
  if (process.env.YTDLP_COOKIES_FROM_BROWSER) {
    args.push("--cookies-from-browser", process.env.YTDLP_COOKIES_FROM_BROWSER);
  }
  if (process.env.YTDLP_EXTRA_ARGS) {
    args.push(...process.env.YTDLP_EXTRA_ARGS.split(" ").filter(Boolean));
  }
  return args;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || `${cmd} exited with code ${code}`));
    });
    proc.on("error", (err) => reject(err));
  });
}

const isForbiddenError = (err) => /403|Forbidden/i.test(err.message || "");

// Runs yt-dlp, automatically retrying with different player-client personas
// if YouTube responds with a 403. `buildArgs(clientOverride)` returns the
// full args array for a given attempt (clientOverride is null on the first,
// unmodified attempt).
async function runWithFallback(buildArgs) {
  let lastErr;
  for (const client of PLAYER_CLIENT_FALLBACKS) {
    try {
      return await run("yt-dlp", buildArgs(client));
    } catch (err) {
      lastErr = err;
      if (!isForbiddenError(err)) throw err; // only worth retrying on 403s
    }
  }
  throw new Error(
    `${lastErr.message}\n\nSudah dicoba otomatis dengan beberapa metode berbeda tapi YouTube tetap menolak. Coba isi YTDLP_COOKIES_FROM_BROWSER di .env, atau update yt-dlp: py -m pip install -U yt-dlp`
  );
}

function clientArgs(client) {
  return client ? ["--extractor-args", `youtube:player_client=${client}`] : [];
}

// Get metadata without downloading (title, artist/uploader, duration, thumbnail)
async function getInfo(url) {
  const { stdout } = await runWithFallback((client) => [
    "-J",
    "--no-playlist",
    ...userArgs(),
    ...clientArgs(client),
    url,
  ]);
  const info = JSON.parse(stdout);
  return {
    title: info.title,
    artist: info.uploader || info.artist || info.channel || "Unknown",
    duration: info.duration,
    thumbnail: info.thumbnail,
    sourceUrl: url,
  };
}

// Search YouTube for a query (used as the fallback source for Spotify tracks)
async function searchFirst(query) {
  const { stdout } = await runWithFallback((client) => [
    `ytsearch1:${query}`,
    "-J",
    "--no-playlist",
    ...userArgs(),
    ...clientArgs(client),
  ]);
  const info = JSON.parse(stdout);
  // info.entries can be an empty array (truthy!) when the search found
  // nothing — guard against that instead of crashing on entry.title below.
  const entry = info.entries && info.entries.length ? info.entries[0] : info.id ? info : null;
  if (!entry) {
    throw new Error(`Gak nemu hasil YouTube buat pencarian: "${query}". Coba cari manual dan pakai link YouTube langsung.`);
  }
  return {
    title: entry.title,
    artist: entry.uploader || entry.channel || "Unknown",
    duration: entry.duration,
    thumbnail: entry.thumbnail,
    sourceUrl: entry.webpage_url || `https://www.youtube.com/watch?v=${entry.id}`,
  };
}

// Download best audio track to TMP_DIR, return the raw file path
async function downloadAudio(url) {
  const id = uuid();
  const outTemplate = path.join(TMP_DIR, `${id}.raw.%(ext)s`);

  await runWithFallback((client) => [
    "-f",
    "bestaudio/best",
    "--no-playlist",
    ...userArgs(),
    ...clientArgs(client),
    "-o",
    outTemplate,
    url,
  ]);

  // yt-dlp names the file with whatever ext it grabbed; find it
  const files = fs.readdirSync(TMP_DIR).filter((f) => f.startsWith(`${id}.raw.`));
  if (!files.length) throw new Error("Download finished but output file not found");
  return path.join(TMP_DIR, files[0]);
}

module.exports = { getInfo, searchFirst, downloadAudio };
