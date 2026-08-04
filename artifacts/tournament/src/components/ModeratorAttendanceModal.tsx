import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Users, RefreshCw } from "lucide-react";
import { getModeratorAttendance, setModeratorPeriod, resetModeratorAttendance, type ModeratorAttendanceRecord, type ModeratorAttendanceResponse } from "@/lib/api";

interface Props {
  token: string;
}

const PERIOD_LABELS = {
  beginning: "بداية البث",
  middle: "نصف البث",
  ending: "نهاية البث",
  none: "إيقاف التسجيل",
} as const;

export default function ModeratorAttendanceModal({ token }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ModeratorAttendanceResponse>({ activePeriod: "none", sessionId: null, list: [] });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const next = await getModeratorAttendance();
      setData(next);
    } catch {
      setData({ activePeriod: "none", sessionId: null, list: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void refresh();

    const handleAttendanceUpdated = () => {
      void refresh();
    };

    window.addEventListener("moderator-attendance-updated", handleAttendanceUpdated);
    return () => {
      window.removeEventListener("moderator-attendance-updated", handleAttendanceUpdated);
    };
  }, [open]);

  const records = useMemo(() => data.list || [], [data.list]);

  const handlePeriodChange = async (period: "beginning" | "middle" | "ending" | "none") => {
    setSaving(true);
    try {
      await setModeratorPeriod(period, token);
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await resetModeratorAttendance(token);
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="admin-act gap-2 border-emerald-500/50 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/50">
          <Users className="h-4 w-4 text-emerald-400" />
          جدول المشرفين
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl dir-rtl text-right">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-400" />
              جدول حضور المشرفين
            </span>
            <Badge variant={data.activePeriod === "none" ? "secondary" : "default"}>
              {PERIOD_LABELS[data.activePeriod]}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <span className="text-sm font-medium text-slate-300">تفعيل فترة:</span>
          {(["beginning", "middle", "ending", "none"] as const).map((period) => (
            <Button
              key={period}
              size="sm"
              variant={data.activePeriod === period ? "default" : "outline"}
              disabled={saving}
              onClick={() => handlePeriodChange(period)}
            >
              {PERIOD_LABELS[period]}
            </Button>
          ))}
          <Button size="sm" variant="destructive" disabled={saving} onClick={handleReset}>
            <RefreshCw className="h-3.5 w-3.5" />
            إعادة ضبط
          </Button>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="p-3">اسم المشرف</th>
                <th className="p-3 text-center">بداية البث</th>
                <th className="p-3 text-center">نصف البث</th>
                <th className="p-3 text-center">نهاية البث</th>
                <th className="p-3 text-center">الحضور</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-500">جاري التحميل...</td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-500">لا توجد بيانات حضور حتى الآن.</td>
                </tr>
              ) : (
                records.map((record) => {
                  const total = [record.beginningTime, record.middleTime, record.endingTime].filter(Boolean).length;
                  return (
                    <tr key={record.id} className="hover:bg-slate-900/30">
                      <td className="p-3 font-medium text-slate-100">{record.moderatorName}</td>
                      <td className="p-3 text-center">{renderCell(record.beginningTime)}</td>
                      <td className="p-3 text-center">{renderCell(record.middleTime)}</td>
                      <td className="p-3 text-center">{renderCell(record.endingTime)}</td>
                      <td className="p-3 text-center">{total}/3</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function renderCell(value: string | null) {
  if (!value) return <span className="text-slate-600">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-emerald-400">
      <CheckCircle2 className="h-4 w-4" />
      <span className="text-xs text-slate-300">{value}</span>
    </span>
  );
}
