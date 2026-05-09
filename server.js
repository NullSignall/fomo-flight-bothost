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
const skinPrices = new Map([
  ["vt", 0],
  ["ton", 900],
  ["xrp", 1400],
  ["trx", 2100],
  ["ada", 2900],
  ["avax", 3900],
  ["dot", 5200],
  ["bnb", 7000],
  ["doge", 9400],
  ["pepe", 12500],
  ["link", 16500],
  ["sol", 22000],
  ["ltc", 28500],
  ["eth", 38000],
  ["btc", 50000]
]);

app.use(express.json({ limit: "64kb" }));
app.use(express.static(path.join(__dirname, "public"), {
  extensions: ["html"],
  maxAge: "5m"
}));

app.get("/health", (_, res) => {
  res.json({ ok: true, app: "fomo-flight" });
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

app.post("/api/profile/name", auth, (req, res) => {
  const store = readStore();
  const user = getUser(req.telegramUser, store);
  user.displayName = sanitizeName(req.body.displayName || user.displayName);
  user.updatedAt = new Date().toISOString();
  store.users[user.telegramId] = user;
  writeStore(store);
  res.json({ profile: user });
});

app.post("/api/skin/select", auth, (req, res) => {
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

app.post("/api/skin/buy", auth, (req, res) => {
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

app.post("/api/run/submit", auth, (req, res) => {
  const store = readStore();
  const user = getUser(req.telegramUser, store);
  const run = {
    runId: String(req.body.runId || ""),
    score: Math.floor(Number(req.body.score) || 0),
    vtc: Math.floor(Number(req.body.vtc) || 0),
    durationMs: Math.floor(Number(req.body.durationMs) || 0),
    selectedSkin: String(req.body.selectedSkin || "")
  };

  const validation = validateRun(run, user, store);
  if (!validation.ok) return res.status(400).json({ error: validation.error });

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

app.post("/api/daily/claim", auth, (req, res) => {
  const store = readStore();
  const user = getUser(req.telegramUser, store);
  const today = new Date().toISOString().slice(0, 10);
  if (user.lastDaily === today) return res.json({ claimed: false, profile: user });

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const nextStreak = user.lastDaily === yesterday ? user.dailyStreak + 1 : 1;
  user.dailyStreak = nextStreak > 7 ? 1 : nextStreak;
  user.lastDaily = today;
  user.totalVtc += 50;
  user.updatedAt = new Date().toISOString();
  store.users[user.telegramId] = user;
  writeStore(store);
  res.json({ claimed: true, profile: user });
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
  user.dailyStreak = Math.max(0, Math.min(7, Math.floor(Number(user.dailyStreak) || 0)));
  user.lastDaily = typeof user.lastDaily === "string" ? user.lastDaily : "";
  return user;
}

function validateRun(run, user, store) {
  if (!run.runId || run.runId.length > 80 || store.runs[run.runId]) return { ok: false, error: "bad_run_id" };
  if (run.score < 0 || run.vtc < 0 || run.durationMs < 1000) return { ok: false, error: "bad_run" };
  const seconds = run.durationMs / 1000;
  if (run.score / seconds > 45) return { ok: false, error: "score_rate" };
  if (run.vtc / seconds > 4) return { ok: false, error: "vtc_rate" };
  if (!user.unlockedSkins.includes(run.selectedSkin)) return { ok: false, error: "skin_not_unlocked" };
  return { ok: true };
}

function sanitizeName(value) {
  return String(value || "").replace(/[^\w\u0430-\u044f\u0410-\u042f\u0451\u0401 -]/g, "").trim().slice(0, 24) || "Pilot";
}

function readStore() {
  if (!fs.existsSync(dataPath)) return { users: {}, runs: {} };
  const store = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  store.users = store.users || {};
  store.runs = store.runs || {};
  for (const user of Object.values(store.users)) normalizeUser(user);
  return store;
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(dataPath, JSON.stringify(store, null, 2));
}

app.listen(port, () => {
  console.log(`Fomo Flight listening on ${port}`);
});
