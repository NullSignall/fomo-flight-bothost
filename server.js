import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const botToken = process.env.BOT_TOKEN || "";
const dataPath = process.env.DATA_PATH || path.join(__dirname, "data", "store.json");
const publicUrl = String(process.env.PUBLIC_URL || "https://bot-1778289451-5878-nullsignal.bothost.tech").replace(/\/+$/, "");
const miniAppLink = process.env.MINI_APP_LINK || "https://t.me/FomoFlightBot?startapp=share";
const shareDir = process.env.SHARE_DIR || path.join(__dirname, "data", "share");
const backupDir = process.env.BACKUP_DIR || path.join(__dirname, "data", "backups");
const suspiciousLogPath = process.env.SUSPICIOUS_LOG_PATH || path.join(__dirname, "data", "suspicious-runs.jsonl");
const buildVersion = "2026-05-11-security-1";
const dailyMax = 12;
let lastBackupDay = "";
const skinPrices = new Map([
  ["vt", 0],
  ["ton", 1150],
  ["xrp", 1800],
  ["trx", 2700],
  ["ada", 3700],
  ["avax", 5000],
  ["dot", 6700],
  ["bnb", 9000],
  ["doge", 12000],
  ["pepe", 16000],
  ["link", 21000],
  ["sol", 28000],
  ["ltc", 36500],
  ["eth", 49000],
  ["btc", 64000]
]);
const mapPrices = new Map([
  ["terminal", 0],
  ["bull", 7500],
  ["bear", 11000],
  ["ethprism", 18000],
  ["liquidation", 28000],
  ["btccitadel", 45000]
]);
const promoCodes = new Map([
  ["tam100", { reward: 10000, maxUses: 1 }]
]);
const rateBuckets = new Map();

app.use(express.json({ limit: "12mb" }));
app.use((req, res, next) => {
  res.setHeader("x-fomo-flight-build", buildVersion);
  next();
});
app.use("/api", rateLimit("api-global", 180, 60_000));
app.use(express.static(path.join(__dirname, "public"), {
  extensions: ["html"],
  etag: false,
  lastModified: false,
  maxAge: 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".html")) {
      res.setHeader("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("pragma", "no-cache");
      res.setHeader("expires", "0");
    }
  }
}));

app.get("/health", (_, res) => {
  res.json({ ok: true, app: "fomo-flight", build: buildVersion });
});

app.get("/api/config", (_, res) => {
  res.json({ miniAppLink, publicUrl });
});

app.use("/share", (req, res, next) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-expose-headers", "content-type, content-length");
  res.setHeader("cross-origin-resource-policy", "cross-origin");
  next();
}, express.static(shareDir, {
  etag: false,
  lastModified: false,
  maxAge: "7d",
  setHeaders: (res, filePath) => {
    res.setHeader("cache-control", "public, max-age=604800, immutable");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("content-disposition", "inline");
    if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) {
      res.setHeader("content-type", "image/jpeg");
    } else if (filePath.endsWith(".png")) {
      res.setHeader("content-type", "image/png");
    }
  }
}));

app.get("/debug/share-latest", debugOnly, (_, res) => {
  const latestPath = path.join(shareDir, "latest.json");
  if (!fs.existsSync(latestPath)) return res.status(404).json({ error: "no_share_card_yet" });
  res.json(JSON.parse(fs.readFileSync(latestPath, "utf8")));
});

app.get("/debug/share-latest-image", debugOnly, (_, res) => {
  const latestPath = path.join(shareDir, "latest.json");
  if (!fs.existsSync(latestPath)) return res.status(404).send("No share card yet");
  const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
  res.redirect(latest.mediaUrl);
});

app.get("/debug/story-static", debugOnly, (_, res) => {
  res.sendFile(path.join(__dirname, "public", "assets", "story", "fomo-story.jpg"), {
    headers: {
      "content-type": "image/jpeg",
      "content-disposition": "inline",
      "cache-control": "public, max-age=604800, immutable",
      "x-content-type-options": "nosniff"
    }
  });
});

app.get("/api/leaderboard", (_, res) => {
  const store = readStore();
  const rows = Object.values(store.users)
    .sort((a, b) => b.bestScore - a.bestScore)
    .slice(0, 100)
    .map((user) => ({ displayName: user.displayName, bestScore: user.bestScore }));
  res.json({ rows });
});

app.get("/api/profile", auth, (req, res) => {
  res.json({ profile: getUser(req.telegramUser) });
});

app.post("/api/profile/name", auth, rateLimit("name", 8, 60_000), (req, res) => {
  const store = readStore();
  const user = getUser(req.telegramUser, store);
  const nextName = sanitizeName(req.body.displayName || user.displayName);
  const problem = nicknameProblem(nextName);
  if (problem) return res.status(400).json({ error: problem });
  if (isNameTaken(nextName, user.telegramId, store)) return res.status(409).json({ error: "name_taken" });
  user.displayName = nextName;
  user.updatedAt = new Date().toISOString();
  store.users[user.telegramId] = user;
  writeStore(store);
  res.json({ profile: user });
});

app.post("/api/skin/select", auth, rateLimit("skin-select", 60, 60_000), (req, res) => {
  const store = readStore();
  const user = getUser(req.telegramUser, store);
  const skinId = String(req.body.skinId || "");
  if (!skinPrices.has(skinId)) return res.status(400).json({ error: "unknown_skin" });
  if (!user.unlockedSkins.includes(skinId)) return res.status(400).json({ error: "skin_locked" });
  user.selectedSkin = skinId;
  user.updatedAt = new Date().toISOString();
  store.users[user.telegramId] = user;
  writeStore(store);
  res.json({ profile: user });
});

app.post("/api/skin/buy", auth, rateLimit("skin-buy", 25, 60_000), (req, res) => {
  const store = readStore();
  const user = getUser(req.telegramUser, store);
  const skinId = String(req.body.skinId || "");
  const price = skinPrices.get(skinId);
  if (price === undefined) return res.status(400).json({ error: "unknown_skin" });
  if (!user.unlockedSkins.includes(skinId)) {
    if (user.totalVtc < price) return res.status(400).json({ error: "not_enough_vtc" });
    user.totalVtc -= price;
    user.unlockedSkins.push(skinId);
  }
  user.selectedSkin = skinId;
  user.updatedAt = new Date().toISOString();
  store.users[user.telegramId] = user;
  writeStore(store);
  res.json({ profile: user });
});

app.post("/api/map/select", auth, rateLimit("map-select", 60, 60_000), (req, res) => {
  const store = readStore();
  const user = getUser(req.telegramUser, store);
  const mapId = String(req.body.mapId || "");
  if (!mapPrices.has(mapId)) return res.status(400).json({ error: "unknown_map" });
  if (!user.unlockedMaps.includes(mapId)) return res.status(400).json({ error: "map_locked" });
  user.selectedMap = mapId;
  user.updatedAt = new Date().toISOString();
  store.users[user.telegramId] = user;
  writeStore(store);
  res.json({ profile: user });
});

app.post("/api/map/buy", auth, rateLimit("map-buy", 25, 60_000), (req, res) => {
  const store = readStore();
  const user = getUser(req.telegramUser, store);
  const mapId = String(req.body.mapId || "");
  const price = mapPrices.get(mapId);
  if (price === undefined) return res.status(400).json({ error: "unknown_map" });
  if (!user.unlockedMaps.includes(mapId)) {
    if (user.totalVtc < price) return res.status(400).json({ error: "not_enough_vtc" });
    user.totalVtc -= price;
    user.unlockedMaps.push(mapId);
  }
  user.selectedMap = mapId;
  user.updatedAt = new Date().toISOString();
  store.users[user.telegramId] = user;
  writeStore(store);
  res.json({ profile: user });
});

app.post("/api/promo/redeem", auth, rateLimit("promo", 5, 60_000), (req, res) => {
  const store = readStore();
  const user = getUser(req.telegramUser, store);
  const code = normalizePromoCode(req.body.code);
  const promo = promoCodes.get(code);
  if (!promo) return res.status(400).json({ error: "promo_invalid" });
  user.promoUses = user.promoUses && typeof user.promoUses === "object" ? user.promoUses : {};
  const used = Math.max(0, Math.floor(Number(user.promoUses[code]) || 0));
  if (used >= promo.maxUses) return res.status(400).json({ error: "promo_limit" });
  user.promoUses[code] = used + 1;
  user.totalVtc += promo.reward;
  user.updatedAt = new Date().toISOString();
  store.users[user.telegramId] = user;
  writeStore(store);
  res.json({ accepted: true, reward: promo.reward, usesLeft: promo.maxUses - user.promoUses[code], profile: user });
});

app.post("/api/run/start", auth, rateLimit("run-start", 25, 60_000), (req, res) => {
  const store = readStore();
  const user = getUser(req.telegramUser, store);
  const selectedSkin = String(req.body.selectedSkin || user.selectedSkin);
  const selectedMap = String(req.body.selectedMap || user.selectedMap);
  if (!user.unlockedSkins.includes(selectedSkin)) return res.status(400).json({ error: "skin_not_unlocked" });
  if (!user.unlockedMaps.includes(selectedMap)) return res.status(400).json({ error: "map_not_unlocked" });

  const runToken = crypto.randomBytes(18).toString("base64url");
  store.runStarts[runToken] = {
    telegramId: user.telegramId,
    selectedSkin,
    selectedMap,
    startedAt: new Date().toISOString()
  };
  writeStore(store);
  res.json({ runToken, startedAt: store.runStarts[runToken].startedAt });
});

app.post("/api/run/submit", auth, rateLimit("run-submit", 20, 60_000), (req, res) => {
  const store = readStore();
  const user = getUser(req.telegramUser, store);
  const run = {
    runId: String(req.body.runId || ""),
    runToken: String(req.body.runToken || ""),
    score: Math.floor(Number(req.body.score) || 0),
    vtc: Math.floor(Number(req.body.vtc) || 0),
    durationMs: Math.floor(Number(req.body.durationMs) || 0),
    selectedSkin: String(req.body.selectedSkin || "")
  };

  const validation = validateRun(run, user, store);
  if (!validation.ok) {
    logSuspiciousRun(req, user, run, validation.error, validation.details);
    if (run.runToken && store.runStarts[run.runToken]?.telegramId === user.telegramId) delete store.runStarts[run.runToken];
    writeStore(store);
    return res.status(400).json({ error: validation.error });
  }
  if (validation.suspicious) logSuspiciousRun(req, user, run, "suspicious_but_accepted", validation.details);
  delete store.runStarts[run.runToken];

  store.runs[run.runId] = {
    telegramId: user.telegramId,
    score: run.score,
    vtc: run.vtc,
    durationMs: run.durationMs,
    createdAt: new Date().toISOString()
  };
  user.totalVtc += run.vtc;
  user.bestScore = Math.max(user.bestScore, run.score);
  user.updatedAt = new Date().toISOString();
  store.users[user.telegramId] = user;
  writeStore(store);
  res.json({ accepted: true, profile: user });
});

app.post("/api/daily/claim", auth, rateLimit("daily", 8, 60_000), (req, res) => {
  const store = readStore();
  const user = getUser(req.telegramUser, store);
  const today = new Date().toISOString().slice(0, 10);
  if (user.lastDaily === today) return res.json({ claimed: false, profile: user });

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const nextStreak = user.lastDaily === yesterday ? user.dailyStreak + 1 : 1;
  user.dailyStreak = nextStreak > dailyMax ? 1 : nextStreak;
  user.lastDaily = today;
  user.totalVtc += 50;
  user.updatedAt = new Date().toISOString();
  store.users[user.telegramId] = user;
  writeStore(store);
  res.json({ claimed: true, profile: user });
});

app.post("/api/share-card", auth, rateLimit("share-card", 8, 60_000), (req, res) => {
  const image = String(req.body.image || "");
  const match = image.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
  if (!match || match[2].length > 10_500_000) return res.status(400).json({ error: "bad_image" });

  const userId = String(req.telegramUser.id);
  const id = `${userId}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
  const ext = match[1] === "jpeg" ? "jpg" : "png";
  const fileName = `${id}.${ext}`;
  const bytes = Buffer.from(match[2], "base64");
  fs.mkdirSync(shareDir, { recursive: true });
  fs.writeFileSync(path.join(shareDir, fileName), bytes);
  const result = {
    mediaUrl: `${publicUrl}/share/${fileName}`,
    miniAppLink,
    fileName,
    bytes: bytes.length,
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(shareDir, "latest.json"), JSON.stringify(result, null, 2));
  res.json(result);
});

app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

function auth(req, res, next) {
  if (!botToken) return res.status(500).json({ error: "BOT_TOKEN is not configured" });
  const initData = String(req.header("x-telegram-init-data") || req.body.initData || "");
  const verified = verifyInitData(initData, botToken);
  if (!verified.ok) return res.status(401).json({ error: verified.error });
  req.telegramUser = verified.user;
  next();
}

function debugOnly(_, res, next) {
  if (process.env.DEBUG_ENDPOINTS === "1") return next();
  res.status(404).send("Not found");
}

function rateLimit(scope, limit, windowMs) {
  return (req, res, next) => {
    const now = Date.now();
    const ip = req.headers["x-forwarded-for"] ? String(req.headers["x-forwarded-for"]).split(",")[0].trim() : req.socket.remoteAddress || "unknown";
    const userKey = req.telegramUser?.id ? `tg:${req.telegramUser.id}` : `ip:${ip}`;
    const key = `${scope}:${userKey}`;
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      cleanupRateBuckets(now);
      return next();
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      res.setHeader("retry-after", Math.ceil((bucket.resetAt - now) / 1000));
      return res.status(429).json({ error: "rate_limited" });
    }
    next();
  };
}

function cleanupRateBuckets(now) {
  if (rateBuckets.size < 5000) return;
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}

function verifyInitData(initData, token) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, error: "missing_hash" };
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const calculated = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const a = Buffer.from(calculated, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, error: "bad_hash" };

  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return { ok: false, error: "expired" };

  const user = JSON.parse(params.get("user") || "{}");
  if (!user.id) return { ok: false, error: "missing_user" };
  return { ok: true, user };
}

function getUser(tgUser, store = readStore()) {
  const telegramId = String(tgUser.id);
  if (!store.users[telegramId]) {
    store.users[telegramId] = {
      telegramId,
      displayName: sanitizeName(tgUser.username || tgUser.first_name || `Pilot ${telegramId.slice(-4)}`),
      totalVtc: 0,
      bestScore: 0,
      selectedSkin: "vt",
      unlockedSkins: ["vt"],
      selectedMap: "terminal",
      unlockedMaps: ["terminal"],
      promoUses: {},
      dailyStreak: 0,
      lastDaily: "",
      updatedAt: new Date().toISOString()
    };
    writeStore(store);
  }
  return store.users[telegramId];
}

function normalizeUser(user) {
  user.totalVtc = Math.max(0, Math.floor(Number(user.totalVtc) || 0));
  user.bestScore = Math.max(0, Math.floor(Number(user.bestScore) || 0));
  user.displayName = sanitizeName(user.displayName || `Pilot ${String(user.telegramId).slice(-4)}`);
  user.unlockedSkins = Array.isArray(user.unlockedSkins) ? [...new Set(user.unlockedSkins.filter((id) => skinPrices.has(id)))] : ["vt"];
  if (!user.unlockedSkins.includes("vt")) user.unlockedSkins.unshift("vt");
  user.selectedSkin = user.unlockedSkins.includes(user.selectedSkin) ? user.selectedSkin : "vt";
  user.unlockedMaps = Array.isArray(user.unlockedMaps) ? [...new Set(user.unlockedMaps.filter((id) => mapPrices.has(id)))] : ["terminal"];
  if (!user.unlockedMaps.includes("terminal")) user.unlockedMaps.unshift("terminal");
  user.selectedMap = user.unlockedMaps.includes(user.selectedMap) ? user.selectedMap : "terminal";
  user.promoUses = user.promoUses && typeof user.promoUses === "object" ? user.promoUses : {};
  user.dailyStreak = Math.max(0, Math.min(dailyMax, Math.floor(Number(user.dailyStreak) || 0)));
  user.lastDaily = typeof user.lastDaily === "string" ? user.lastDaily : "";
  return user;
}

function validateRun(run, user, store) {
  if (!/^[A-Za-z0-9_.:-]{8,96}$/.test(run.runId) || store.runs[run.runId]) return { ok: false, error: "bad_run_id" };
  if (!run.runToken || !store.runStarts[run.runToken]) return { ok: false, error: "bad_run_token" };
  const start = store.runStarts[run.runToken];
  if (start.telegramId !== user.telegramId) return { ok: false, error: "run_token_owner" };
  if (start.selectedSkin !== run.selectedSkin) return { ok: false, error: "run_skin_mismatch", details: { expected: start.selectedSkin, got: run.selectedSkin } };
  if (run.score < 0 || run.vtc < 0 || run.durationMs < 1000 || run.durationMs > 3_600_000) return { ok: false, error: "bad_run" };
  const seconds = run.durationMs / 1000;
  const scoreRate = run.score / seconds;
  const vtcRate = run.vtc / seconds;
  const serverElapsedMs = Date.now() - Date.parse(start.startedAt);
  if (!Number.isFinite(serverElapsedMs) || serverElapsedMs < 0) return { ok: false, error: "bad_run_start" };
  if (run.durationMs > serverElapsedMs + 10_000) return { ok: false, error: "run_time_drift", details: { durationMs: run.durationMs, serverElapsedMs } };
  const maxScoreRate = seconds < 15 ? 66 : seconds < 45 ? 60 : seconds < 180 ? 56 : 52;
  const maxVtcRate = seconds < 15 ? 24 : seconds < 45 ? 20 : seconds < 180 ? 17 : 14;
  if (scoreRate > maxScoreRate) return { ok: false, error: "score_rate", details: { scoreRate, maxScoreRate, seconds } };
  if (vtcRate > maxVtcRate) return { ok: false, error: "vtc_rate", details: { vtcRate, maxVtcRate, seconds } };
  if (run.score > 50000) return { ok: false, error: "score_cap", details: { score: run.score } };
  if (run.vtc > Math.max(80, run.score * 0.18 + 160)) return { ok: false, error: "vtc_score_ratio", details: { score: run.score, vtc: run.vtc } };
  if (!user.unlockedSkins.includes(run.selectedSkin)) return { ok: false, error: "skin_not_unlocked" };
  const suspicious = run.score > 12000 || scoreRate > maxScoreRate * 0.82 || vtcRate > maxVtcRate * 0.82 || serverElapsedMs - run.durationMs > 300_000;
  return { ok: true, suspicious, details: suspicious ? { scoreRate, vtcRate, seconds, serverElapsedMs } : undefined };
}

function logSuspiciousRun(req, user, run, reason, details = {}) {
  const entry = {
    at: new Date().toISOString(),
    reason,
    telegramId: user.telegramId,
    displayName: user.displayName,
    run,
    details,
    ip: req.headers["x-forwarded-for"] ? String(req.headers["x-forwarded-for"]).split(",")[0].trim() : req.socket.remoteAddress || ""
  };
  try {
    fs.mkdirSync(path.dirname(suspiciousLogPath), { recursive: true });
    fs.appendFileSync(suspiciousLogPath, `${JSON.stringify(entry)}\n`);
  } catch (error) {
    console.warn("Failed to write suspicious run log", error);
  }
}

function sanitizeName(value) {
  return String(value || "").replace(/[^\w\u0430-\u044f\u0410-\u042f\u0451\u0401 -]/g, "").trim().slice(0, 24) || "Pilot";
}

function normalizePromoCode(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function normalizeNameForCompare(value) {
  return String(value || "").toLowerCase().replace(/[\s_\-.]+/g, "");
}

function normalizeNameForCheck(value) {
  const map = { a: "\u0430", e: "\u0435", o: "\u043E", p: "\u0440", c: "\u0441", x: "\u0445", y: "\u0443", k: "\u043A", m: "\u043C", h: "\u043D", b: "\u0432", t: "\u0442", 0: "\u043E", 3: "\u0437", 4: "\u0447", 6: "\u0431" };
  return String(value || "")
    .toLowerCase()
    .replace(/[a-z0-9]/g, (ch) => map[ch] || ch)
    .replace(/[\s_\-.]+/g, "");
}

function nicknameProblem(value) {
  const cleaned = sanitizeName(value);
  if (cleaned.length < 2) return "nickname_short";
  const compact = normalizeNameForCheck(cleaned);
  const bad = [
    "\u0431\u043B\u044F",
    "\u0445\u0443\u0439",
    "\u0445\u0443\u0435",
    "\u043F\u0438\u0437\u0434",
    "\u043F\u0438\u0434\u043E\u0440",
    "\u0435\u0431\u0430",
    "\u0435\u0431\u0438",
    "\u0435\u0431\u0443",
    "\u0435\u0431\u043B",
    "\u0435\u0431\u043D",
    "\u0451\u0431\u0430",
    "\u0451\u0431\u043D",
    "\u0441\u0443\u043A\u0430",
    "\u0448\u043B\u044E\u0445",
    "\u0433\u0430\u043D\u0434\u043E\u043D"
  ];
  return bad.some((word) => compact.includes(word)) ? "nickname_bad_words" : "";
}

function isNameTaken(name, telegramId, store) {
  const normalized = normalizeNameForCompare(name);
  return Object.values(store.users).some((user) => user.telegramId !== telegramId && normalizeNameForCompare(user.displayName) === normalized);
}

function readStore() {
  if (!fs.existsSync(dataPath)) return { users: {}, runs: {}, runStarts: {} };
  const store = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  store.users = store.users || {};
  store.runs = store.runs || {};
  store.runStarts = store.runStarts || {};
  pruneRunStarts(store);
  for (const user of Object.values(store.users)) normalizeUser(user);
  return store;
}

function writeStore(store) {
  store.users = store.users || {};
  store.runs = store.runs || {};
  store.runStarts = store.runStarts || {};
  pruneRunStarts(store);
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(dataPath, JSON.stringify(store, null, 2));
  maybeBackupStore();
}

function pruneRunStarts(store) {
  const cutoff = Date.now() - 4 * 60 * 60 * 1000;
  for (const [token, runStart] of Object.entries(store.runStarts || {})) {
    if (!runStart?.startedAt || Date.parse(runStart.startedAt) < cutoff) delete store.runStarts[token];
  }
}

function maybeBackupStore() {
  const day = new Date().toISOString().slice(0, 10);
  if (lastBackupDay === day || !fs.existsSync(dataPath)) return;
  lastBackupDay = day;
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(dataPath, path.join(backupDir, `store-${day}.json`));
    const backups = fs.readdirSync(backupDir)
      .filter((file) => /^store-\d{4}-\d{2}-\d{2}\.json$/.test(file))
      .sort()
      .reverse();
    for (const oldBackup of backups.slice(14)) fs.unlinkSync(path.join(backupDir, oldBackup));
  } catch (error) {
    console.warn("Failed to write store backup", error);
  }
}

app.listen(port, () => {
  console.log(`Fomo Flight listening on ${port}`);
});
