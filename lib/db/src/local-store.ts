import fs from "fs";
import path from "path";

// مخزّن محلي بملف JSON — يُستخدم تلقائياً عند تشغيل الخادم بدون DATABASE_URL (localhost بدون Postgres).
// يحفظ نفس البيانات (الحالة، الفائزون، الأرشيف، سجل البطولات) في ملف على القرص عشان تبقى بعد إعادة التشغيل.
const FILE = process.env.LOCAL_DB_FILE || path.resolve(process.cwd(), "local-data.json");

// نفس حدود التخزين المستعملة فـ وضع Postgres (lib/db/src/index.ts)، عشان ملف
// local-data.json ما يكبرش بلا حدود هو الآخر (خصوصاً مع صور Base64 فـ records).
const MAX_WINNERS = 500;
const MAX_ARCHIVES = 150;
const MAX_RECORDS = 100;

interface Store {
  state: any | null;
  winners: any[];
  archives: any[];
  records: any[];
  helpers: any[];
  playerWins: any[];
  playerMatchWins: any[];
  seq: { winners: number; archives: number; records: number; helpers: number; playerWins: number; playerMatchWins: number };
}

function empty(): Store {
  return { state: null, winners: [], archives: [], records: [], helpers: [], playerWins: [], playerMatchWins: [], seq: { winners: 0, archives: 0, records: 0, helpers: 0, playerWins: 0, playerMatchWins: 0 } };
}

let cache: Store | null = null;

function load(): Store {
  if (cache) return cache;
  try {
    if (fs.existsSync(FILE)) {
      const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
      cache = { ...empty(), ...parsed, seq: { ...empty().seq, ...(parsed.seq || {}) } };
    } else {
      cache = empty();
    }
  } catch {
    cache = empty();
  }
  return cache!;
}

// نبقي فقط أحدث `max` عنصر فـ المصفوفة (نفترض أنها مرتّبة من الأقدم للأحدث
// حسب ترتيب الإضافة، فنحذف من البداية).
function capArray<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  return arr.slice(arr.length - max);
}

function save(s: Store) {
  s.winners = capArray(s.winners, MAX_WINNERS);
  s.archives = capArray(s.archives, MAX_ARCHIVES);
  s.records = capArray(s.records, MAX_RECORDS);
  cache = s;
  try {
    fs.writeFileSync(FILE, JSON.stringify(s, null, 2), "utf8");
  } catch (e) {
    console.error("⚠️ فشل حفظ الملف المحلي:", e);
  }
}

const nowISO = () => new Date().toISOString();

export const localStore = {
  filePath: FILE,

  getState() {
    return load().state || undefined;
  },
  saveState(data: any) {
    const s = load();
    // نشيل أي id/createdAt منزلقين من كائن قادم من مصدر آخر، تفادياً لتلوث الحالة.
    const { id: _ignoredId, createdAt: _ignoredCreatedAt, ...safeData } = data || {};
    s.state = { ...(s.state || {}), ...safeData, updatedAt: nowISO() };
    save(s);
    return [s.state];
  },

  getWinners() {
    return [...load().winners].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  },
  addWinner(w: any) {
    const s = load();
    const row = { ...w, id: ++s.seq.winners, date: w.date || nowISO(), createdAt: nowISO() };
    s.winners.push(row);
    save(s);
    return [row];
  },

  getArchives() {
    return [...load().archives].sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)));
  },
  getArchiveById(id: number) {
    return load().archives.find((a) => a.id === id);
  },
  addArchive(a: any) {
    const s = load();
    const row = { ...a, id: ++s.seq.archives, finishedAt: a.finishedAt || nowISO(), createdAt: nowISO() };
    s.archives.push(row);
    save(s);
    return [row];
  },

  getRecords() {
    return [...load().records].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  },
  addRecord(r: any) {
    const s = load();
    const row = { isHidden: false, ...r, id: ++s.seq.records, createdAt: nowISO() };
    s.records.push(row);
    save(s);
    return [row];
  },
  // تعديل/إنشاء سجل لعبة بالمفتاح tournamentName (اسم اللعبة) — سجل واحد لكل لعبة.
  upsertRecord(r: any) {
    const s = load();
    const idx = s.records.findIndex((x) => x.tournamentName === r.tournamentName);
    if (idx >= 0) {
      const row = {
        ...s.records[idx],
        winnerName: r.winnerName ?? "",
        image: r.image ?? "",
        // displayName و image2 يُحدَّثان فقط إذا جاءا فـ الطلب، وإلا نبقي القيمة المحفوظة.
        displayName: r.displayName !== undefined ? r.displayName : s.records[idx].displayName,
        image2: r.image2 !== undefined ? r.image2 : (s.records[idx].image2 ?? ""),
      };
      s.records[idx] = row;
      save(s);
      return [row];
    }
    const row = { isHidden: false, ...r, id: ++s.seq.records, createdAt: nowISO() };
    s.records.push(row);
    save(s);
    return [row];
  },
  deleteRecord(id: number) {
    const s = load();
    const idx = s.records.findIndex((r) => r.id === id);
    const removed = idx >= 0 ? s.records.splice(idx, 1) : [];
    save(s);
    return removed;
  },
  // إخفاء/إظهار كرت فائز بدون حذف بياناته
  setRecordVisibility(id: number, isHidden: boolean) {
    const s = load();
    const idx = s.records.findIndex((r) => r.id === id);
    if (idx < 0) return [];
    s.records[idx] = { ...s.records[idx], isHidden };
    save(s);
    return [s.records[idx]];
  },

  getHelpers() {
    return [...load().helpers].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  },
  findHelperByCode(code: string) {
    return load().helpers.find((h) => h.code === code);
  },
  addHelper(h: any) {
    const s = load();
    const row = { permissions: {}, ...h, id: ++s.seq.helpers, createdAt: nowISO() };
    s.helpers.push(row);
    save(s);
    return row;
  },
  updateHelperPermissions(id: number, permissions: any) {
    const s = load();
    const idx = s.helpers.findIndex((h) => h.id === id);
    if (idx < 0) return null;
    s.helpers[idx] = { ...s.helpers[idx], permissions };
    save(s);
    return s.helpers[idx];
  },
  deleteHelper(id: number) {
    const s = load();
    const idx = s.helpers.findIndex((h) => h.id === id);
    const removed = idx >= 0 ? s.helpers.splice(idx, 1) : [];
    save(s);
    return removed[0] || null;
  },

  // ── فوزات اللاعبين (Player Wins) ──
  // username هنا يجي مطبَّعاً مسبقاً من طبقة index.ts (lowercase/trim).
  getPlayerWins(username: string) {
    return load().playerWins.filter((w) => w.username === username);
  },
  // 📊 تجميع كل اللاعبين مع مجموع فوزاتهم (نظام المستويات)
  getPlayerLevels(limit = 500) {
    const s = load();
    const map = new Map<string, { username: string; wins: number }>();
    for (const w of s.playerWins || []) {
      const n = Number(w.wins) || 0;
      if (n <= 0) continue;
      const cur = map.get(w.username);
      if (cur) cur.wins += n;
      else map.set(w.username, { username: w.displayName || w.username, wins: n });
    }
    return [...map.values()].sort((a, b) => b.wins - a.wins).slice(0, limit);
  },
  setPlayerWins(username: string, displayName: string, game: string, wins: number) {
    const s = load();
    const idx = s.playerWins.findIndex((w) => w.username === username && w.game === game);
    if (idx >= 0) {
      s.playerWins[idx] = { ...s.playerWins[idx], wins, displayName: displayName || s.playerWins[idx].displayName, updatedAt: nowISO() };
      save(s);
      return s.playerWins[idx];
    }
    const row = { id: ++s.seq.playerWins, username, displayName, game, wins, updatedAt: nowISO(), createdAt: nowISO() };
    s.playerWins.push(row);
    save(s);
    return row;
  },
  // 🏆 المتصدّرون: أعلى اللاعبين حسب عدد الماتشات المكسوبة داخل البطولات.
  // مصدرها playerMatchWins المستقل — لا علاقة لها بكروت الألعاب ولا بشريط اللفل.
  getLeaderboard(limit: number) {
    const s = load();
    return (s.playerMatchWins || [])
      .filter((w) => (w.wins || 0) > 0)
      .sort((a, b) => (b.wins || 0) - (a.wins || 0) || String(a.updatedAt).localeCompare(String(b.updatedAt)))
      .slice(0, Math.max(1, limit))
      .map((w) => ({ username: w.displayName || w.username, wins: w.wins || 0 }));
  },
  // ➕ زيادة/إنقاص فوزات الماتشات (delta = +1 عند كسب ماتش، -1 عند التراجع).
  incrementPlayerMatchWin(username: string, displayName: string, delta: number) {
    const s = load();
    if (!s.playerMatchWins) s.playerMatchWins = [];
    const idx = s.playerMatchWins.findIndex((w) => w.username === username);
    if (idx >= 0) {
      const next = Math.max(0, (s.playerMatchWins[idx].wins || 0) + delta);
      s.playerMatchWins[idx] = { ...s.playerMatchWins[idx], wins: next, displayName: displayName || s.playerMatchWins[idx].displayName, updatedAt: nowISO() };
      save(s);
      return s.playerMatchWins[idx];
    }
    const row = { id: ++s.seq.playerMatchWins, username, displayName, wins: Math.max(0, delta), updatedAt: nowISO(), createdAt: nowISO() };
    s.playerMatchWins.push(row);
    save(s);
    return row;
  },
  // ✍️ تعيين قيمة صريحة لنقاط التوب (تحكم يدوي من الأدمن).
  setPlayerMatchWins(username: string, displayName: string, wins: number) {
    const s = load();
    if (!s.playerMatchWins) s.playerMatchWins = [];
    const value = Math.max(0, Math.floor(wins));
    const idx = s.playerMatchWins.findIndex((w) => w.username === username);
    if (idx >= 0) {
      s.playerMatchWins[idx] = { ...s.playerMatchWins[idx], wins: value, displayName: displayName || s.playerMatchWins[idx].displayName, updatedAt: nowISO() };
      save(s);
      return s.playerMatchWins[idx];
    }
    const row = { id: ++s.seq.playerMatchWins, username, displayName, wins: value, updatedAt: nowISO(), createdAt: nowISO() };
    s.playerMatchWins.push(row);
    save(s);
    return row;
  },
  // 🧹 تصفير نقاط التوب لكل اللاعبين (تبدأ موسم جديد).
  resetAllPlayerMatchWins() {
    const s = load();
    const count = (s.playerMatchWins || []).length;
    s.playerMatchWins = [];
    save(s);
    return { cleared: count };
  },
  incrementPlayerWin(username: string, displayName: string, game: string, delta: number) {
    const s = load();
    const idx = s.playerWins.findIndex((w) => w.username === username && w.game === game);
    if (idx >= 0) {
      const next = Math.max(0, (s.playerWins[idx].wins || 0) + delta);
      s.playerWins[idx] = { ...s.playerWins[idx], wins: next, displayName: displayName || s.playerWins[idx].displayName, updatedAt: nowISO() };
      save(s);
      return s.playerWins[idx];
    }
    const row = { id: ++s.seq.playerWins, username, displayName, game, wins: Math.max(0, delta), updatedAt: nowISO(), createdAt: nowISO() };
    s.playerWins.push(row);
    save(s);
    return row;
  },
};
