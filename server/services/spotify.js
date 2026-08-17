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

// Primary method: Spotify's public oEmbed endpoint (fast, clean JSON, zero auth)
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

// Fallback method: scrape the regular track page's Open Graph meta tags.
// Used when /oembed specifically is having trouble but the main site isn't
// (these are often served by different backends/caches on Spotify's side).
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

// Spotify's streams are DRM'd, so neither method above ever gives us audio —
// just metadata, which we use to build a search query and pull the actual
// audio from YouTube.
async function resolve(spotifyUrl) {
  let meta;
  try {
    meta = await tryOembed(spotifyUrl);
  } catch (oembedErr) {
    try {
      meta = await tryPageScrape(spotifyUrl);
    } catch (scrapeErr) {
      throw new Error(
        `Gagal ambil metadata dari Spotify lewat 2 metode berbeda. oEmbed: ${oembedErr.message} | Scrape halaman: ${scrapeErr.message}. Coba lagi beberapa saat, atau cek link-nya bener/gak private.`
      );
    }
  }

  const rawTitle = meta.title || "";
  const query = `${rawTitle} audio`;
  const match = await ytdlp.searchFirst(query);

  return {
    title: rawTitle || match.title,
    artist: match.artist,
    thumbnail: meta.thumbnail || match.thumbnail,
    duration: match.duration,
    sourceUrl: match.sourceUrl, // the YouTube URL we'll actually download from
    originUrl: spotifyUrl,
    provider: "spotify",
  };
}

module.exports = { resolve };

