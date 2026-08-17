const { spawn } = require("child_process");
const path = require("path");
const { v4: uuid } = require("uuid");

const TMP_DIR = process.env.TMP_DIR || "./tmp";

// atempo only accepts 0.5–2.0 per instance, so speeds outside that range
// (like the 2.3x "safe zone" in the UI) need to be chained. This works, but
// chaining multiple atempo stages can introduce audible artifacts (a
// "muddy"/bassy quality some people describe) — rubberband (checked below)
// does the same job in a single higher-quality pass when it's available.
function buildAtempoChain(speed) {
  let remaining = speed;
  const stages = [];
  while (remaining > 2.0) {
    stages.push(2.0);
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    stages.push(0.5);
    remaining /= 0.5;
  }
  stages.push(remaining);
  return stages.map((s) => `atempo=${s.toFixed(4)}`).join(",");
}

function run(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

// Detect once (and cache) whether this ffmpeg build has the "rubberband"
// filter — it needs to be compiled with --enable-librubberband. Windows
// "essentials" builds from gyan.dev typically DON'T include it; "full"
// builds do. Falls back to the atempo chain automatically if unavailable.
let rubberbandSupport = null;
function hasRubberband() {
  if (rubberbandSupport !== null) return Promise.resolve(rubberbandSupport);
  return new Promise((resolve) => {
    const proc = spawn("ffmpeg", ["-hide_banner", "-filters"]);
    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.on("close", () => {
      rubberbandSupport = /\brubberband\b/.test(stdout);
      resolve(rubberbandSupport);
    });
    proc.on("error", () => {
      rubberbandSupport = false;
      resolve(false);
    });
  });
}

/**
 * @param {string} inputPath  raw downloaded audio file
 * @param {object} opts
 * @param {number} opts.speed    e.g. 2.3  (1.0 = normal)
 * @param {number} opts.amplifyDb e.g. -4  (0 = no change)
 * @param {"mp3"|"ogg"} opts.format
 */
async function processAudio(inputPath, { speed = 1.0, amplifyDb = 0, format = "mp3" } = {}) {
  const id = uuid();
  const ext = format === "ogg" ? "ogg" : "mp3";
  const outPath = path.join(TMP_DIR, `${id}.out.${ext}`);

  const filters = [];
  if (speed && speed !== 1.0) {
    const useRubberband = await hasRubberband();
    filters.push(useRubberband ? `rubberband=tempo=${speed.toFixed(4)}` : buildAtempoChain(speed));
  }
  if (amplifyDb && amplifyDb !== 0) filters.push(`volume=${amplifyDb}dB`);

  const args = ["-y", "-i", inputPath];
  if (filters.length) args.push("-af", filters.join(","));

  if (format === "ogg") {
    args.push("-c:a", "libvorbis", "-qscale:a", "5");
  } else {
    args.push("-c:a", "libmp3lame", "-b:a", "192k");
  }
  args.push(outPath);

  await run(args);
  return outPath;
}

module.exports = { process: processAudio, buildAtempoChain, hasRubberband };
