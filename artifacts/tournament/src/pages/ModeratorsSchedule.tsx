import { useEffect, useState } from "react";
import {
  getModerators,
  addModerator,
  deleteModerator,
  resetModeratorAttendance,
  useModeratorsSSE,
  type ModeratorRow,
} from "@/lib/api";

interface Props {
  token: string;
  onClose: () => void;
}

// ⏰ يحوّل timestamp لصيغة وقت مقروءة (HH:MM) بتوقيت المتصفح
function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

// خانة واحدة بالجدول: ✅ + الوقت لو اتسجّل، وإلا شكل فارغ بسيط
function AttendanceCell({ at }: { at: string | null }) {
  if (!at) {
    return <span className="mod-cell mod-cell-empty">—</span>;
  }
  return (
    <span className="mod-cell mod-cell-done">
      ✅ <span className="mod-cell-time">{fmtTime(at)}</span>
    </span>
  );
}

export default function ModeratorsSchedule({ token, onClose }: Props) {
  const [mods, setMods] = useState<ModeratorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getModerators(token)
      .then((list) => setMods(list))
      .catch((err) => setError(err.message || "فشل التحميل"))
      .finally(() => setLoading(false));
  }, [token]);

  // 🔄 تحديث لحظي: أي تسجيل حضور جديد من الشات (أو إضافة/حذف مشرف) ينعكس
  // فوراً بدون ما نحتاج نعيد تحميل الصفحة.
  useModeratorsSSE((list) => setMods(list));

  async function handleAdd() {
    if (!newUsername.trim()) return;
    setBusy(true);
    setError("");
    try {
      await addModerator(newUsername.trim(), newDisplayName.trim() || newUsername.trim(), token);
      setNewUsername("");
      setNewDisplayName("");
    } catch (err: any) {
      setError(err.message || "فشل الإضافة");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("حذف هذا المشرف نهائياً من الجدول؟")) return;
    setBusy(true);
    try {
      await deleteModerator(id, token);
    } catch (err: any) {
      setError(err.message || "فشل الحذف");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetSession() {
    if (!confirm("بدء بث جديد؟ هذا يفرّغ خانات الحضور الثلاث لكل المشرفين (بدون حذفهم من القائمة).")) return;
    setBusy(true);
    try {
      await resetModeratorAttendance(token);
    } catch (err: any) {
      setError(err.message || "فشل التصفير");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mod-schedule-overlay">
      <div className="mod-schedule-panel">
        <div className="mod-schedule-header">
          <h2>📋 جدول المشرفين (Moderators Schedule)</h2>
          <button className="mod-close-btn" onClick={onClose}>✕ إغلاق</button>
        </div>

        <p className="mod-schedule-hint">
          يطلب من كل مشرف كتابة كلمة <b>«حاضر»</b> أو <b>«متواجد»</b> بالشات 3 مرات خلال البث —
          أول مرة تسجَّل فـ «بداية البث»، الثانية فـ «منتصف البث»، الثالثة فـ «نهاية البث».
        </p>

        {error && <div className="mod-error">{error}</div>}

        <div className="mod-add-row">
          <input
            type="text"
            placeholder="يوزرنيم المشرف بكيك"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            disabled={busy}
          />
          <input
            type="text"
            placeholder="اسم العرض (اختياري)"
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
            disabled={busy}
          />
          <button onClick={handleAdd} disabled={busy || !newUsername.trim()}>➕ إضافة مشرف</button>
          <button className="mod-reset-btn" onClick={handleResetSession} disabled={busy}>
            🔄 بدء بث جديد (تصفير الحضور)
          </button>
        </div>

        {loading ? (
          <p>...جارِ التحميل</p>
        ) : mods.length === 0 ? (
          <p className="mod-empty-state">لا يوجد مشرفون مضافون بعد — أضف أول مشرف من الأعلى.</p>
        ) : (
          <table className="mod-table">
            <thead>
              <tr>
                <th>المشرف</th>
                <th>بداية البث</th>
                <th>منتصف البث</th>
                <th>نهاية البث</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {mods.map((m) => (
                <tr key={m.id}>
                  <td className="mod-name-cell">{m.displayName || m.username}</td>
                  <td><AttendanceCell at={m.streamStartAt} /></td>
                  <td><AttendanceCell at={m.midStreamAt} /></td>
                  <td><AttendanceCell at={m.streamEndAt} /></td>
                  <td>
                    <button className="mod-delete-btn" onClick={() => handleDelete(m.id)} disabled={busy}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}