// ---------- auth guard: redirect to login if not signed in ----------
if (!requireLogin()) {
  throw new Error("redirecting to login");
}

const state = {
  platform: "youtube",
  track: null,       // { title, artist, thumbnail, sourceUrl }
  fileId: null,       // converted file on the server, ready to upload
  convertedMeta: null, // { title, artist, sizeMb, format } from the last successful convert
  format: "mp3",
};

const els = {
  tabs: document.querySelectorAll(".tab"),
  inputIcon: document.getElementById("inputIcon"),
  urlInput: document.getElementById("urlInput"),
  pasteBtn: document.getElementById("pasteBtn"),
  searchBtn: document.getElementById("searchBtn"),
  status: document.getElementById("status"),
  trackCard: document.getElementById("trackCard"),
  trackThumb: document.getElementById("trackThumb"),
  trackTitle: document.getElementById("trackTitle"),
  trackArtist: document.getElementById("trackArtist"),
  trackMeta: document.getElementById("trackMeta"),
  advToggle: document.getElementById("advToggle"),
  advBody: document.getElementById("advBody"),
  advArrow: document.getElementById("advArrow"),
  speedSlider: document.getElementById("speedSlider"),
  speedVal: document.getElementById("speedVal"),
  ampSlider: document.getElementById("ampSlider"),
  ampVal: document.getElementById("ampVal"),
  formatSelect: document.getElementById("formatSelect"),
  creatorSelect: document.getElementById("creatorSelect"),
  convertBtn: document.getElementById("convertBtn"),
  convertResult: document.getElementById("convertResult"),
  resultTitle: document.getElementById("resultTitle"),
  resultMeta: document.getElementById("resultMeta"),
  downloadBtn: document.getElementById("downloadBtn"),
  uploadBtn: document.getElementById("uploadBtn"),
  log: document.getElementById("log"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  userIdInput: document.getElementById("userIdInput"),
  groupIdInput: document.getElementById("groupIdInput"),
  saveCredsBtn: document.getElementById("saveCredsBtn"),
  accName: document.getElementById("accName"),
  accHandle: document.getElementById("accHandle"),
  uploadHistory: document.getElementById("uploadHistory"),
  resetDefaultBtn: document.getElementById("resetDefaultBtn"),
  playbackNormalVal: document.getElementById("playbackNormalVal"),
  formatDetailLabel: document.getElementById("formatDetailLabel"),
  formatDetailValue: document.getElementById("formatDetailValue"),
  viewAllBtn: document.getElementById("viewAllBtn"),
  whoEmail: document.getElementById("whoEmail"),
  whoAvatar: document.getElementById("whoAvatar"),
  tierBadge: document.getElementById("tierBadge"),
  adminLink: document.getElementById("adminLink"),
  upgradeBtn: document.getElementById("upgradeBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  usageBar: document.getElementById("usageBar"),
  upgradeModal: document.getElementById("upgradeModal"),
  planOptions: document.getElementById("planOptions"),
  closeModalBtn: document.getElementById("closeModalBtn"),
};

// ---------- session / topbar ----------
async function loadMe() {
  try {
    const res = await fetch("/api/auth/me", { headers: authHeaders() });
    if (res.status === 401) {
      clearSession();
      window.location.href = "login.html";
      return;
    }
    const data = await res.json();
    saveUser(data.user);
    els.whoEmail.textContent = data.user.username || data.user.handle || "User";
    if (data.user.avatarUrl) {
      els.whoAvatar.src = data.user.avatarUrl;
      els.whoAvatar.style.display = "";
    }
    if (data.user.role === "admin") els.adminLink.style.display = "";

    if (data.usage.tier === "paid") {
      els.tierBadge.textContent = "PREMIUM";
      els.tierBadge.className = "badge paid";
      els.usageBar.innerHTML = `<span>✨ Kamu Premium — convert unlimited</span>`;
      els.usageBar.classList.remove("warn");
      els.upgradeBtn.style.display = "none";
    } else {
      els.tierBadge.textContent = "FREE";
      els.tierBadge.className = "badge free";
      const { used, limit, remaining } = data.usage;
      els.usageBar.innerHTML = `<span>Jatah gratis hari ini: <strong>${used}/${limit}</strong> convert</span><span>${remaining} tersisa</span>`;
      els.usageBar.classList.toggle("warn", remaining === 0);
      els.upgradeBtn.style.display = "";
    }
  } catch {
    // network hiccup — non-fatal, topbar just stays blank
  }
}

els.logoutBtn.addEventListener("click", () => {
  clearSession();
  window.location.href = "login.html";
});

// ---------- upgrade / payment flow ----------
let midtransConfigLoaded = false;
async function ensureMidtransScript() {
  if (midtransConfigLoaded) return;
  const res = await fetch("/api/payment/config");
  const cfg = await res.json();
  if (!cfg.clientKey) return; // not configured yet, checkout button will show a clear error instead

  const script = document.createElement("script");
  script.src = cfg.isProduction
    ? "https://app.midtrans.com/snap/snap.js"
    : "https://app.sandbox.midtrans.com/snap/snap.js";
  script.setAttribute("data-client-key", cfg.clientKey);
  document.head.appendChild(script);
  midtransConfigLoaded = true;
}

els.upgradeBtn.addEventListener("click", async () => {
  els.upgradeModal.classList.remove("hidden");
  await ensureMidtransScript();

  try {
    const res = await fetch("/api/payment/plans");
    const data = await res.json();
    els.planOptions.innerHTML = Object.entries(data.plans)
      .map(
        ([key, plan]) => `
        <div class="plan-card" data-plan="${key}">
          <span>${plan.label}</span>
          <span class="price">Rp ${plan.price.toLocaleString("id-ID")}</span>
        </div>`
      )
      .join("");

    els.planOptions.querySelectorAll(".plan-card").forEach((card) => {
      card.addEventListener("click", () => startCheckout(card.dataset.plan));
    });
  } catch {
    els.planOptions.innerHTML = `<div class="plan-card muted">Gagal load plan, coba lagi.</div>`;
  }
});

els.closeModalBtn.addEventListener("click", () => els.upgradeModal.classList.add("hidden"));

async function startCheckout(plan) {
  try {
    const res = await fetch("/api/payment/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    els.upgradeModal.classList.add("hidden");

    if (window.snap) {
      window.snap.pay(data.token, {
        onSuccess: () => { logLine("Pembayaran berhasil! Akun kamu jadi Premium.", "ok"); loadMe(); },
        onPending: () => logLine("Pembayaran pending, selesaikan dulu ya.", ""),
        onError: () => logLine("Pembayaran gagal.", "err"),
        onClose: () => logLine("Kamu menutup jendela pembayaran.", ""),
      });
    } else if (data.redirectUrl) {
      window.location.href = data.redirectUrl;
    }
  } catch (err) {
    logLine(`Gagal mulai checkout: ${err.message}`, "err");
  }
}

// ---------- persistence (kept local in the browser only) ----------
function loadCreds() {
  const saved = JSON.parse(localStorageSafe("get") || "{}");
  if (saved.apiKey) els.apiKeyInput.value = saved.apiKey;
  if (saved.userId) els.userIdInput.value = saved.userId;
  if (saved.groupId) els.groupIdInput.value = saved.groupId;
  refreshCreatorOptions();
}
function localStorageSafe(mode, value) {
  try {
    if (mode === "get") return localStorage.getItem("robloxAudioCreds");
    localStorage.setItem("robloxAudioCreds", value);
  } catch {
    return null;
  }
}
els.saveCredsBtn.addEventListener("click", () => {
  const creds = {
    apiKey: els.apiKeyInput.value.trim(),
    userId: els.userIdInput.value.trim(),
    groupId: els.groupIdInput.value.trim(),
  };
  localStorageSafe("set", JSON.stringify(creds));
  refreshCreatorOptions();
  logLine("Kredensial disimpan di browser lokal kamu.", "ok");
  if (creds.userId || creds.groupId) {
    els.accName.textContent = creds.groupId ? `Group ${creds.groupId}` : `User ${creds.userId}`;
    els.accHandle.textContent = "Siap upload via Open Cloud";
  }
});

function refreshCreatorOptions() {
  const userId = els.userIdInput.value.trim();
  const groupId = els.groupIdInput.value.trim();
  els.creatorSelect.innerHTML = "";
  if (userId) {
    const opt = document.createElement("option");
    opt.value = JSON.stringify({ userId });
    opt.textContent = `Akun Pribadi (User ${userId})`;
    els.creatorSelect.appendChild(opt);
  }
  if (groupId) {
    const opt = document.createElement("option");
    opt.value = JSON.stringify({ groupId });
    opt.textContent = `Group (${groupId})`;
    els.creatorSelect.appendChild(opt);
  }
  if (!userId && !groupId) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Isi User ID / Group ID di panel kanan dulu";
    els.creatorSelect.appendChild(opt);
  }
}

// ---------- tabs ----------
els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    els.tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    state.platform = tab.dataset.platform;
    els.inputIcon.textContent = state.platform === "spotify" ? "◉" : "▶";
    els.urlInput.placeholder = state.platform === "spotify"
      ? "Paste link Spotify"
      : "Paste link YouTube";
    resetTrack();
  });
});

els.pasteBtn.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    els.urlInput.value = text;
  } catch {
    logLine("Browser ini gak izinin paste otomatis, paste manual aja (Ctrl+V).", "err");
  }
});

// ---------- resolve (search) ----------
els.searchBtn.addEventListener("click", resolveTrack);
els.urlInput.addEventListener("keydown", (e) => { if (e.key === "Enter") resolveTrack(); });

async function resolveTrack() {
  const url = els.urlInput.value.trim();
  if (!url) return setStatus("Masukin link dulu", "err");

  setStatus("Mencari...", "loading");
  resetTrack();

  try {
    const res = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ url, platform: state.platform }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.track = data.track;
    els.trackThumb.src = data.track.thumbnail || "";
    els.trackTitle.textContent = data.track.title;
    els.trackArtist.textContent = data.track.artist;
    els.trackMeta.textContent = data.track.duration
      ? `${Math.floor(data.track.duration / 60)}:${String(data.track.duration % 60).padStart(2, "0")}`
      : "";
    els.trackCard.classList.remove("hidden");
    setStatus("Loaded", "ok");
  } catch (err) {
    setStatus(err.message || "Gagal ambil data", "err");
  }
}

function resetTrack() {
  state.track = null;
  state.fileId = null;
  state.convertedMeta = null;
  els.trackCard.classList.add("hidden");
  els.convertResult.classList.add("hidden");
  setStatus("");
}

function setStatus(text, cls) {
  els.status.textContent = text;
  els.status.className = cls || "";
}

// ---------- advanced settings ----------
let advOpen = true;
els.advToggle.addEventListener("click", () => {
  advOpen = !advOpen;
  els.advBody.style.display = advOpen ? "" : "none";
  els.advArrow.textContent = advOpen ? "▲" : "▼";
});

els.speedSlider.addEventListener("input", () => {
  const speed = Number(els.speedSlider.value);
  els.speedVal.textContent = `${speed.toFixed(2)}x`;
  // "Playback Speed Normal" = inverse of the speed multiplier (1 / speed),
  // i.e. how slow/fast the track's original tempo reads relative to the
  // converted output — matches the reference UI's readout.
  els.playbackNormalVal.textContent = (1 / speed).toFixed(2);
});
els.ampSlider.addEventListener("input", () => {
  els.ampVal.textContent = `${els.ampSlider.value}dB`;
});
els.userIdInput.addEventListener("input", refreshCreatorOptions);
els.groupIdInput.addEventListener("input", refreshCreatorOptions);

const FORMAT_DETAILS = {
  mp3: { label: "High quality audio", value: "192 kbps" },
  ogg: { label: "Smaller file size", value: "~128 kbps (VBR)" },
};
els.formatSelect.addEventListener("change", () => {
  const detail = FORMAT_DETAILS[els.formatSelect.value] || FORMAT_DETAILS.mp3;
  els.formatDetailLabel.textContent = detail.label;
  els.formatDetailValue.textContent = detail.value;
});

els.resetDefaultBtn.addEventListener("click", (e) => {
  e.stopPropagation(); // don't let this bubble up and collapse the Advanced Settings panel
  els.speedSlider.value = 2.3;
  els.ampSlider.value = -4;
  els.formatSelect.value = "mp3";
  els.speedSlider.dispatchEvent(new Event("input"));
  els.ampSlider.dispatchEvent(new Event("input"));
  els.formatSelect.dispatchEvent(new Event("change"));
  logLine("Advanced settings direset ke default.", "");
});

// "View All" is now a plain link to history.html (see index.html), no JS needed

// ---------- convert ----------
els.convertBtn.addEventListener("click", async () => {
  if (!state.track) return logLine("Search / load track dulu sebelum convert.", "err");

  els.convertBtn.disabled = true;
  els.convertBtn.textContent = "⏳ Downloading & converting...";
  els.convertResult.classList.add("hidden");

  try {
    const convertRes = await fetch("/api/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        url: state.track.sourceUrl || els.urlInput.value.trim(),
        platform: state.platform,
        speed: els.speedSlider.value,
        amplifyDb: els.ampSlider.value,
        format: els.formatSelect.value,
        title: state.track.title,
        artist: state.track.artist,
      }),
    });
    const convertData = await convertRes.json();
    if (convertRes.status === 429) {
      logLine(convertData.error, "err");
      els.upgradeBtn.click();
      return;
    }
    if (!convertRes.ok) throw new Error(convertData.error);

    logLine(`Convert selesai: ${convertData.title} (${convertData.sizeMb} MB, ${convertData.format})`, "ok");
    state.fileId = convertData.fileId;
    state.convertedMeta = convertData;
    loadMe(); // refresh usage counter in the topbar

    els.resultTitle.textContent = convertData.title;
    els.resultMeta.textContent = `${convertData.artist} · ${convertData.sizeMb} MB · ${convertData.format}`;
    els.convertResult.classList.remove("hidden");
  } catch (err) {
    logLine(`Gagal: ${err.message}`, "err");
  } finally {
    els.convertBtn.disabled = false;
    els.convertBtn.textContent = "📄 Convert";
  }
});

// ---------- download (before uploading, so you can listen/check first) ----------
els.downloadBtn.addEventListener("click", async () => {
  if (!state.fileId) return;
  els.downloadBtn.disabled = true;
  els.downloadBtn.textContent = "⏳ Menyiapkan...";
  try {
    const nameParam = encodeURIComponent(state.convertedMeta?.title || "audio");
    const res = await fetch(`/api/convert/file/${state.fileId}?name=${nameParam}`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Gagal download file");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.convertedMeta?.title || "audio"}.${state.convertedMeta?.format || "mp3"}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    logLine("File berhasil di-download.", "ok");
  } catch (err) {
    logLine(`Gagal download: ${err.message}`, "err");
  } finally {
    els.downloadBtn.disabled = false;
    els.downloadBtn.textContent = "⬇ Download";
  }
});

// ---------- upload to Roblox (separate step, after reviewing the download) ----------
els.uploadBtn.addEventListener("click", async () => {
  if (!state.fileId) return logLine("Convert dulu sebelum upload.", "err");

  const creatorRaw = els.creatorSelect.value;
  if (!creatorRaw) return logLine("Pilih Target Creator (isi User ID / Group ID) dulu.", "err");

  const apiKey = els.apiKeyInput.value.trim();
  if (!apiKey) return logLine("Isi Open Cloud API Key di panel kanan dulu.", "err");

  els.uploadBtn.disabled = true;
  els.uploadBtn.textContent = "⏳ Uploading...";

  try {
    const uploadRes = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        fileId: state.fileId,
        displayName: state.convertedMeta.title,
        artist: state.convertedMeta.artist,
        description: `Uploaded via converter — ${state.convertedMeta.artist}`,
        creator: JSON.parse(creatorRaw),
        apiKey,
      }),
    });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(uploadData.error);

    logLine(`Upload berhasil! Asset ID: ${uploadData.assetId}`, "ok");
    addHistory({
      title: state.convertedMeta.title,
      artist: state.convertedMeta.artist,
      assetId: uploadData.assetId,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    logLine(`Gagal: ${err.message}`, "err");
  } finally {
    els.uploadBtn.disabled = false;
    els.uploadBtn.textContent = "☁ Upload ke Roblox";
  }
});

function logLine(text, cls) {
  const div = document.createElement("div");
  div.textContent = `> ${text}`;
  if (cls === "ok") div.className = "line-ok";
  if (cls === "err") div.className = "line-err";
  els.log.prepend(div);
}

// ---------- upload history (persisted server-side, survives refresh) ----------
async function loadHistory() {
  try {
    const res = await fetch("/api/history", { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.history.length) return; // keep the "No conversions yet" placeholder
    els.uploadHistory.innerHTML = "";
    data.history.forEach((entry) => renderHistoryItem(entry));
  } catch {
    // non-fatal — history just won't populate this load
  }
}

function renderHistoryItem(entry) {
  const li = document.createElement("li");
  const when = new Date(entry.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  const assetLabel = entry.assetId ? `rbxassetid://${entry.assetId}` : "pending";
  li.innerHTML = `
    <span>
      <strong>${entry.title}</strong>${entry.artist ? ` <span class="muted">— ${entry.artist}</span>` : ""}
    </span>
    <span class="muted">${assetLabel} · ${when}</span>`;
  els.uploadHistory.prepend(li);
}

function addHistory(entry) {
  if (els.uploadHistory.querySelector(".muted-placeholder, .muted")) {
    const placeholder = els.uploadHistory.querySelector("li.muted");
    if (placeholder && els.uploadHistory.children.length === 1) els.uploadHistory.innerHTML = "";
  }
  renderHistoryItem(entry);
}

// init
loadCreds();
loadHistory();
loadMe();
