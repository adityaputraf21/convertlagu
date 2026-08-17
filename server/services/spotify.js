const fetch = require("node-fetch");
const ytdlp = require("./ytdlp");

const RETRYABLE_STATUSES = new Set([502, 503, 504]);

const BROWSER_HEADERS = {
  // Spotify rejects requests with no/blank User-Agent (treated as bot traffic).
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

async function fetchWithRetry(url, headers, attempt = 1, maxAttempts = 3) {
  let res;
  try {
    res = await fetch(url, { headers, timeout: 15000 });
  } catch (networkErr) {
    throw new Error(`Gak bisa konek ke Spotify: ${networkErr.message}. Cek koneksi internet / firewall / antivirus.`);
  }

  if (RETRYABLE_STATUSES.has(res.status) && attempt < maxAttempts) {
    await new Promise((r) => setTimeout(r, attempt * 800));
    return fetchWithRetry(url, headers, attempt + 1, maxAttempts);
  }
  return res;
}

function extractTrackId(spotifyUrl) {
  const match = spotifyUrl.match(/track\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

// ---------- Method 1 (preferred when configured): official Spotify Web API ----------
// Uses the Client Credentials flow — this is a real authenticated API call,
// not a scrape/embed request, so it isn't affected by the bot-detection
// heuristics that flag datacenter IPs (like Railway's) differently from
// residential ones. Needs a free app at https://developer.spotify.com/dashboard.
let cachedToken = null;
let cachedTokenExpiry = 0;

async function getSpotifyApiToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry) return cachedToken;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    timeout: 15000,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gagal auth ke Spotify API (HTTP ${res.status}): ${body.slice(0, 150)}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // refresh 60s early
  return cachedToken;
}

async function tryOfficialApi(spotifyUrl) {
  const trackId = extractTrackId(spotifyUrl);
  if (!trackId) throw new Error("URL bukan link track Spotify yang valid");

  const token = await getSpotifyApiToken();
  const res = await fetchWithRetry(`https://api.spotify.com/v1/tracks/${trackId}`, {
    Authorization: `Bearer ${token}`,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Spotify API HTTP ${res.status}: ${body.slice(0, 150)}`);
  }
  const data = await res.json();
  const artistNames = (data.artists || []).map((a) => a.name).join(", ");
  return {
    title: data.name || "",
    thumbnail: data.album?.images?.[0]?.url || "",
    apiArtist: artistNames, // official API gives us the real artist name directly
  };
}

// ---------- Method 2 (fallback): Spotify's public oEmbed endpoint ----------
async function tryOembed(spotifyUrl) {
  const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
  const res = await fetchWithRetry(oembedUrl, { ...BROWSER_HEADERS, Accept: "application/json" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`oEmbed HTTP ${res.status}: ${body.slice(0, 150)}`);
  }
  const data = await res.json();
  return { title: data.title || "", thumbnail: data.thumbnail_url || "" };
}

// ---------- Fallback 2: scrape the regular track page's Open Graph meta tags ----------
async function tryPageScrape(spotifyUrl) {
  const res = await fetchWithRetry(spotifyUrl, { ...BROWSER_HEADERS, Accept: "text/html" });
  if (!res.ok) throw new Error(`Halaman track HTTP ${res.status}`);
  const html = await res.text();

  const titleMatch = html.match(/<meta property="og:title" content="([^"]*)"/);
  const imageMatch = html.match(/<meta property="og:image" content="([^"]*)"/);
  if (!titleMatch) throw new Error("Gak nemu judul lagu di halaman track (struktur halaman Spotify mungkin berubah)");

  return {
    title: decodeHtmlEntities(titleMatch[1]),
    thumbnail: imageMatch ? imageMatch[1] : "",
  };
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Spotify's streams are DRM'd, so none of the methods above ever gives us
// audio — just metadata, which we use to build a search query and pull the
// actual audio from YouTube.
async function resolve(spotifyUrl) {
  let meta;
  const errors = [];

  // Prefer the official API when credentials are configured — most reliable,
  // especially on datacenter IPs (Railway, etc.) that scraping/oEmbed
  // sometimes get flagged on.
  if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
    try {
      meta = await tryOfficialApi(spotifyUrl);
    } catch (apiErr) {
      errors.push(`API resmi: ${apiErr.message}`);
    }
  }

  if (!meta) {
    try {
      meta = await tryOembed(spotifyUrl);
    } catch (oembedErr) {
      errors.push(`oEmbed: ${oembedErr.message}`);
      try {
        meta = await tryPageScrape(spotifyUrl);
      } catch (scrapeErr) {
        errors.push(`Scrape halaman: ${scrapeErr.message}`);
      }
    }
  }

  if (!meta) {
    throw new Error(
      `Gagal ambil metadata dari Spotify lewat semua metode yang dicoba. ${errors.join(" | ")}. Coba lagi beberapa saat, atau cek link-nya bener/gak private.`
    );
  }

  const rawTitle = meta.title || "";
  const query = `${rawTitle} audio`;
  const match = await ytdlp.searchFirst(query);

  return {
    title: rawTitle || match.title,
    artist: meta.apiArtist || match.artist,
    thumbnail: meta.thumbnail || match.thumbnail,
    duration: match.duration,
    sourceUrl: match.sourceUrl, // the YouTube URL we'll actually download from
    originUrl: spotifyUrl,
    provider: "spotify",
  };
}

module.exports = { resolve };
