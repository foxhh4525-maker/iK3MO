export const BYE = "__BYE__";

export interface Match {
  a: string | null;
  b: string | null;
  winner: string | null;
  isBye: boolean;
}

export interface EntryLogItem {
  user: string;
  time: string;
  avatar?: string; // رابط صورة بروفايل اللاعب من كيك (يُملأ تلقائيًا بعد الانضمام)
}

export interface Winner {
  id: string;
  name: string;
  gameType: string;
  tournamentName: string;
  date: string;
  archiveId?: number;
  // تخصيصات احترافية يضبطها الأدمن لكل فائز على حدة (تظهر بالصفحة العامة)
  color?: string;   // مفتاح الثيم من WINNER_THEMES
  emoji?: string;   // إيموجي/رمز الفائز
  badgeText?: string; // لقب مخصص، مثلاً "بطل النسخة الأولى"
}

export interface WinnerTheme {
  key: string;
  label: string;
  gradient: string;
  glow: string;
  accent: string;
}

export const WINNER_THEMES: WinnerTheme[] = [
  { key: "gold",   label: "ذهبي",     gradient: "linear-gradient(135deg, #f59e0b, #b45309)", glow: "rgba(245,158,11,0.45)", accent: "#fbbf24" },
  { key: "purple", label: "بنفسجي",   gradient: "linear-gradient(135deg, #8b5cf6, #4338ca)", glow: "rgba(139,92,246,0.45)", accent: "#c4b5fd" },
  { key: "blue",   label: "أزرق",     gradient: "linear-gradient(135deg, #0ea5e9, #1d4ed8)", glow: "rgba(14,165,233,0.45)", accent: "#7dd3fc" },
  { key: "green",  label: "أخضر",     gradient: "linear-gradient(135deg, #22c55e, #15803d)", glow: "rgba(34,197,94,0.45)",  accent: "#86efac" },
  { key: "red",    label: "أحمر",     gradient: "linear-gradient(135deg, #ef4444, #b91c1c)", glow: "rgba(239,68,68,0.45)",  accent: "#fca5a5" },
  { key: "pink",   label: "وردي",     gradient: "linear-gradient(135deg, #ec4899, #a21caf)", glow: "rgba(236,72,153,0.45)", accent: "#f9a8d4" },
  { key: "teal",   label: "فيروزي",   gradient: "linear-gradient(135deg, #14b8a6, #0f766e)", glow: "rgba(20,184,166,0.45)", accent: "#5eead4" },
  { key: "dark",   label: "داكن",     gradient: "linear-gradient(135deg, #334155, #0f172a)", glow: "rgba(51,65,85,0.45)",   accent: "#94a3b8" },
];

export const WINNER_EMOJIS = ["🏆", "👑", "🥇", "🔥", "⚡", "💎", "🦁", "🐺", "🎯", "⭐", "🚀", "🛡️"];

export interface TournamentState {
  phase: "setup" | "tournament";
  size: number;
  players: string[];
  rounds: Match[][];
  cur: number;
  bSize: number;
  byeN: number;
  isTeams: boolean;
  teamSize: number;
  name: string;
  gameType: string;
  champion: string;
  scheduledAt: string;
  lastWinner: string;
  lastGameType: string;
  lastTournamentName: string;
  entryLog: EntryLogItem[];
  winnerHistory: Winner[];
  updatedAt: number;
  priorityPlayers: string[];
  priorityOnly: boolean;
  winHistory: HistorySnapshot[];
  joinDeadline: number | null; // ⏱️ توقيت (Date.now() + ms) لإغلاق باب الانضمام تلقائيًا — null يعني الانضمام مفتوح بدون وقت
}

// لقطة من الحالة قبل كل نتيجة فوز (بدون winHistory نفسها عشان ما تتكرر بشكل لا نهائي)
export type HistorySnapshot = Omit<TournamentState, "winHistory">;

export const defaultState = (): TournamentState => ({
  phase: "setup",
  size: 16,
  players: [],
  rounds: [],
  cur: 0,
  bSize: 16,
  byeN: 0,
  isTeams: false,
  teamSize: 2,
  name: "",
  gameType: "",
  champion: "",
  scheduledAt: "",
  lastWinner: "",
  lastGameType: "",
  lastTournamentName: "",
  entryLog: [],
  winnerHistory: [],
  updatedAt: Date.now(),
  priorityPlayers: [],
  priorityOnly: false,
  winHistory: [],
  joinDeadline: null,
});

export interface ScheduleItem {
  id: string;
  gameType: string;
  name: string;
  dateISO: string;
  notes: string;
}

// الألعاب الافتراضية لسجل البطولات — تظهر دائماً كـ 6 كروت ثابتة.
// كل كرت: اسم اللعبة فوق (قابل للتعديل من الأدمن) + اسم الفائز (RGB) تحته + صورة تحت.
// الأدمن ما يضيف بطولات جديدة، بل يعدّل كل لعبة من هذي القائمة (بما فيها الاسم المعروض).
export const DEFAULT_GAMES = ["روكت", "رافل", "ستمبل", "بروهالا", "ماين كرافت", "لعبة 6"] as const;

// سجل لكل لعبة: اسم اللعبة (tournamentName، المفتاح الفريد) + اسم الفائز + صورة (Base64 data URL).
// tournamentName يحمل اسم اللعبة (مو اسم بطولة حرة).
export interface TournamentRecord {
  id: number;
  tournamentName: string; // اسم اللعبة (المفتاح)
  displayName?: string; // اسم مخصص للعبة (يظهر بدل tournamentName)
  winnerName: string; // اسم الفائز (يظهر بألوان RGB تحت اسم اللعبة)
  image: string; // صورة البطولة (الأخضر)
  image2?: string; // صورة إضافية ثانية للكرت (الأصفر) — ميزة الصورتين
  isHidden?: boolean; // لو true: الكرت مخفي عن الصفحة العامة (يقدر الأدمن يرجّعه بأي وقت)
  createdAt: string;
}

export interface TournamentArchive {
  id: number;
  name: string;
  gameType: string;
  champion: string;
  isTeams: boolean;
  teamSize: number;
  players: string[];
  rounds: Match[][];
  finishedAt: string;
}

// ── إحصائيات اللاعب (فوزات + لفل لكل لعبة) ──
// كل 5 فوزات في لعبة معيّنة = لفل واحد. اللفل يبدأ من 0.
export const WINS_PER_LEVEL = 5;

export function levelFromWins(wins: number): number {
  return Math.floor(Math.max(0, wins) / WINS_PER_LEVEL);
}

// عدد الفوزات ضمن اللفل الحالي (0..WINS_PER_LEVEL) — يُستخدم لشريط التقدّم.
export function progressWithinLevel(wins: number): number {
  return Math.max(0, wins) % WINS_PER_LEVEL;
}

export interface PlayerStats {
  username: string;
  wins: Record<string, number>; // اسم اللعبة (tournamentName) → عدد الفوزات
}

// 🏆 صف في قائمة المتصدّرين: اسم اللاعب + مجموع فوزاته عبر كل الألعاب.
export interface LeaderboardEntry {
  username: string;
  wins: number;
}

// جلسة اللاعب المسجّل عبر شات كيك (تُحفظ محلياً بالمتصفح)
export interface PlayerSession {
  username: string; // اسم حساب كيك كما ظهر
}