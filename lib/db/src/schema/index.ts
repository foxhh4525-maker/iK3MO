import { pgTable, text, serial, timestamp, jsonb, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const tournamentStateTable = pgTable("tournament_state", {
  id: serial("id").primaryKey(),
  phase: text("phase", { enum: ["setup", "tournament"] }).notNull().default("setup"),
  size: integer("size").notNull().default(16),
  players: jsonb("players").notNull().default([]),
  rounds: jsonb("rounds").notNull().default([]),
  cur: integer("cur").notNull().default(0),
  bSize: integer("b_size").notNull().default(16),
  byeN: integer("bye_n").notNull().default(0),
  isTeams: boolean("is_teams").notNull().default(false),
  teamSize: integer("team_size").notNull().default(2),
  name: text("name").default(""),
  gameType: text("game_type").default(""),
  champion: text("champion").default(""),
  scheduledAt: text("scheduled_at").default(""),
  lastWinner: text("last_winner").default(""),
  lastGameType: text("last_game_type").default(""),
  lastTournamentName: text("last_tournament_name").default(""),
  entryLog: jsonb("entry_log").notNull().default([]),
  winnerHistory: jsonb("winner_history").notNull().default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const winnersTable = pgTable("winners", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  gameType: text("game_type").notNull(),
  tournamentName: text("tournament_name").notNull(),
  date: timestamp("date").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTournamentStateSchema = createInsertSchema(tournamentStateTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTournamentState = z.infer<typeof insertTournamentStateSchema>;
export type TournamentState = typeof tournamentStateTable.$inferSelect;

export const insertWinnerSchema = createInsertSchema(winnersTable).omit({ id: true, createdAt: true });
export type InsertWinner = z.infer<typeof insertWinnerSchema>;
export type Winner = typeof winnersTable.$inferSelect;

export const tournamentRecordsTable = pgTable("tournament_records", {
  id: serial("id").primaryKey(),
  tournamentName: text("tournament_name").notNull().default(""),
  displayName: text("display_name").notNull().default(""), // اسم اللعبة المعروض (يعدّله الأدمن)
  winnerName: text("winner_name").notNull().default(""),
  image: text("image").notNull().default(""), // صورة البطولة كـ Base64 data URL
  image2: text("image2").notNull().default(""), // صورة إضافية ثانية (ميزة الصورتين)
  isHidden: boolean("is_hidden").notNull().default(false), // يخفيه الأدمن من الصفحة العامة بدون حذفه
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTournamentRecordSchema = createInsertSchema(tournamentRecordsTable).omit({ id: true, createdAt: true });
export type InsertTournamentRecord = z.infer<typeof insertTournamentRecordSchema>;
export type TournamentRecord = typeof tournamentRecordsTable.$inferSelect;

// 🧑‍💼 جلسات تتبع حضور المشرفين: بداية/نصف/نهاية البث.
export const moderatorSessionsTable = pgTable("moderator_sessions", {
  id: serial("id").primaryKey(),
  activePeriod: text("active_period", { enum: ["beginning", "middle", "ending", "none"] }).notNull().default("none"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertModeratorSessionSchema = createInsertSchema(moderatorSessionsTable).omit({ id: true, createdAt: true });
export type InsertModeratorSession = z.infer<typeof insertModeratorSessionSchema>;
export type ModeratorSession = typeof moderatorSessionsTable.$inferSelect;

// 🧾 كل اسم مشرف موثّق في جلسة معينة مع الحضور في 3 فترات للبث.
export const moderatorAttendanceTable = pgTable("moderator_attendance", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().default(0),
  moderatorName: text("moderator_name").notNull(),
  beginningTime: text("beginning_time").default(""),
  middleTime: text("middle_time").default(""),
  endingTime: text("ending_time").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertModeratorAttendanceSchema = createInsertSchema(moderatorAttendanceTable).omit({ id: true, createdAt: true });
export type InsertModeratorAttendance = z.infer<typeof insertModeratorAttendanceSchema>;
export type ModeratorAttendanceRecord = typeof moderatorAttendanceTable.$inferSelect;

export const tournamentArchivesTable = pgTable("tournament_archives", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  gameType: text("game_type").notNull(),
  champion: text("champion").notNull(),
  isTeams: boolean("is_teams").notNull().default(false),
  teamSize: integer("team_size").notNull().default(2),
  players: jsonb("players").notNull().default([]),
  rounds: jsonb("rounds").notNull().default([]),
  finishedAt: timestamp("finished_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTournamentArchiveSchema = createInsertSchema(tournamentArchivesTable).omit({ id: true, createdAt: true });
export type InsertTournamentArchive = z.infer<typeof insertTournamentArchiveSchema>;
export type TournamentArchive = typeof tournamentArchivesTable.$inferSelect;

// حسابات "مساعد أدمن" — الأدمن الرئيسي ينشئها ويحدد صلاحياتها بنفسه.
export const adminHelpersTable = pgTable("admin_helpers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // اسم يعرفه الأدمن الرئيسي فقط (لتمييز المساعدين عن بعض)
  code: text("code").notNull().unique(), // كود الدخول اللي يستخدمه المساعد بدل كلمة مرور الأدمن
  permissions: jsonb("permissions").notNull().default({}), // { tournament: boolean, records: boolean }
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAdminHelperSchema = createInsertSchema(adminHelpersTable).omit({ id: true, createdAt: true });
export type InsertAdminHelper = z.infer<typeof insertAdminHelperSchema>;
export type AdminHelper = typeof adminHelpersTable.$inferSelect;

// فوزات اللاعبين لكل لعبة — الأساس لحساب "اللفل" وشريط التقدّم في الصفحة العامة.
// كل صف = (لاعب معيّن + لعبة معيّنة) وعدد فوزاته فيها. يتزاد تلقائياً كل ما
// الأدمن يحدد اسم فائز جديد لكرت اللعبة. المفتاح المنطقي: (username, game).
// username مخزّن مطبَّعاً (lowercase/trim) عشان المطابقة تكون دقيقة، و
// displayName يحفظ الاسم كما كُتب لأول مرة للعرض.
export const playerWinsTable = pgTable("player_wins", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),               // مفتاح مطبَّع (lowercase/trim)
  displayName: text("display_name").notNull().default(""), // الاسم كما ظهر للعرض
  game: text("game").notNull(),                       // اسم اللعبة (tournamentName)
  wins: integer("wins").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PlayerWin = typeof playerWinsTable.$inferSelect;

// 🏆 فوزات الماتشات — عدّاد مستقل تماماً عن playerWinsTable.
// الفرق المهم: هذا الجدول ما فيه عمود `game` ولا أي ارتباط بكروت الألعاب.
// كل ما لاعب يكسب ماتش داخل أي بطولة (أي جولة، أي لعبة) يزيد رصيده +1.
// هذا الجدول هو المصدر الوحيد لقائمة "توب الفائزين" بالصفحة الرئيسية، بينما
// playerWinsTable يظل كما هو يغذّي شريط اللفل تحت الكروت (بطولات مكسوبة).
// username مفتاح فريد ومطبَّع (lowercase/trim) عشان الزيادة تكون ذرّية بـ UPSERT.
export const playerMatchWinsTable = pgTable("player_match_wins", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull().default(""),
  wins: integer("wins").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PlayerMatchWin = typeof playerMatchWinsTable.$inferSelect;

// 👮 مشرفو البث (Moderators) — قائمة يديرها الأدمن الرئيسي عشان نتتبع تواجدهم
// أثناء البث المباشر. name = اسم حساب المشرف بشات كيك (يُقارن مطبَّعاً/lowercase).
export const moderatorsTable = pgTable("moderators", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // اسم المشرف كما يُكتب بشات كيك
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertModeratorSchema = createInsertSchema(moderatorsTable).omit({ id: true, createdAt: true });
export type InsertModerator = z.infer<typeof insertModeratorSchema>;
export type Moderator = typeof moderatorsTable.$inferSelect;

// ✅ تسجيل حضور المشرفين — صف واحد لكل (مشرف + يوم بث)، وفيه 3 أعمدة توقيت
// لثلاث فترات إثبات تواجد (بداية / نصف / نهاية البث). يتسجل تلقائياً لما
// يكتب المشرف كلمة "حاضر" بشات كيك أثناء ما نافذة تلك الفترة مفتوحة من
// الأدمن (زر "افتح تسجيل" بلوحة الأدمن). المفتاح المنطقي: (moderatorName, sessionDate).
export const moderatorAttendanceTable = pgTable("moderator_attendance", {
  id: serial("id").primaryKey(),
  moderatorName: text("moderator_name").notNull(),      // مطبَّع (lowercase/trim)
  displayName: text("display_name").notNull().default(""), // الاسم كما ظهر بالشات
  sessionDate: text("session_date").notNull(),           // "YYYY-MM-DD" بتوقيت الخادم
  startAt: timestamp("start_at"),
  halfAt: timestamp("half_at"),
  endAt: timestamp("end_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertModeratorAttendanceSchema = createInsertSchema(moderatorAttendanceTable).omit({ id: true, updatedAt: true });
export type InsertModeratorAttendance = z.infer<typeof insertModeratorAttendanceSchema>;
export type ModeratorAttendance = typeof moderatorAttendanceTable.$inferSelect;