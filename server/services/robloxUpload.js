const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const FormData = require("form-data");

const ASSETS_URL = "https://apis.roblox.com/assets/v1/assets";

function mimeFor(filePath) {
  return filePath.endsWith(".ogg") ? "audio/ogg" : "audio/mpeg";
}

/**
 * Uploads a local audio file to Roblox as an Audio asset.
 * @param {object} params
 * @param {string} params.filePath      local path to the .mp3/.ogg
 * @param {string} params.displayName   asset name shown in Roblox
 * @param {string} [params.description]
 * @param {string} params.apiKey        Open Cloud API key (x-api-key)
 * @param {{userId?:string, groupId?:string}} params.creator
 */
async function uploadAudio({ filePath, displayName, description = "", apiKey, creator }) {
  if (!apiKey) throw new Error("ROBLOX_API_KEY belum diset (butuh Open Cloud API key).");
  if (!creator || (!creator.userId && !creator.groupId)) {
    throw new Error("Creator belum dipilih (butuh userId atau groupId).");
  }

  const requestJson = {
    assetType: "Audio",
    displayName: displayName.slice(0, 50), // Roblox caps display names
    description: description.slice(0, 1000),
    creationContext: {
      creator: creator.groupId
        ? { groupId: String(creator.groupId) }
        : { userId: String(creator.userId) },
    },
  };

  const form = new FormData();
  form.append("request", JSON.stringify(requestJson));
  form.append("fileContent", fs.createReadStream(filePath), {
    filename: path.basename(filePath),
    contentType: mimeFor(filePath),
  });

  const createRes = await fetch(ASSETS_URL, {
    method: "POST",
    headers: { "x-api-key": apiKey, ...form.getHeaders() },
    body: form,
  });

  const createBody = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    throw new Error(
      `Upload ditolak Roblox (${createRes.status}): ${createBody.message || JSON.stringify(createBody)}`
    );
  }

  // Roblox's Create Asset response is an Operation object shaped like
  // { "path": "operations/{operationId}", ... } — extract the ID from that.
  const operationId = createBody.path?.split("/").pop();
  if (!operationId) {
    throw new Error(`Roblox gak balikin operation ID yang valid. Respons mentah: ${JSON.stringify(createBody)}`);
  }

  const asset = await pollOperation(operationId, apiKey);
  return { ...asset, operationId };
}

async function pollOperation(operationId, apiKey, { attempts = 15, delayMs = 2000 } = {}) {
  const url = `https://apis.roblox.com/assets/v1/operations/${operationId}`;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, { headers: { "x-api-key": apiKey } });
    const body = await res.json().catch(() => ({}));
    if (body.done) {
      if (body.error) throw new Error(`Roblox menolak asset: ${JSON.stringify(body.error)}`);
      return { assetId: body.response?.assetId, pending: false, raw: body };
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  // Still moderating after ~30s — not a failure, Roblox just needs more time.
  // We record it as "pending" so the person can re-check status later instead
  // of losing the upload attempt entirely.
  return { assetId: null, pending: true, raw: null };
}

// Re-check a previously pending operation's status (called from the history recheck endpoint)
async function checkOperation(operationId, apiKey) {
  const url = `https://apis.roblox.com/assets/v1/operations/${operationId}`;
  const res = await fetch(url, { headers: { "x-api-key": apiKey } });
  const body = await res.json().catch(() => ({}));
  if (!body.done) return { assetId: null, pending: true, raw: body };
  if (body.error) throw new Error(`Roblox menolak asset: ${JSON.stringify(body.error)}`);
  return { assetId: body.response?.assetId, pending: false, raw: body };
}

module.exports = { uploadAudio, checkOperation };
