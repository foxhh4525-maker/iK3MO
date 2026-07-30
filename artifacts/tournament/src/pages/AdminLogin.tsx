import { useState, useEffect, useRef, useCallback } from "react";
import bgImg from "@assets/ik3mo-bg-1280_1782771571176.jpg";
import { adminLogin, adminHelperLogin, getDevAdminStatus, devAdminLogin, type DevAdminStatus, type AdminSession } from "@/lib/api";

interface Props {
  onLogin: (session: AdminSession) => void;
}

export default function AdminLogin({ onLogin }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // "checking" أثناء التحقق، ثم إحدى حالات الأدمن التجريبي
  const [status, setStatus] = useState<"checking" | DevAdminStatus>("checking");
  const autoTried = useRef(false);
  // وضع الدخول: أدمن رئيسي (كلمة مرور) أو مساعد (كود يعطيه له الأدمن)
  const [mode, setMode] = useState<"admin" | "helper">("admin");

  // نتحقق من حالة الخادم/الملف: لو الملف موجود ندخل تلقائياً بدون كلمة مرور
  const check = useCallback(async () => {
    setStatus("checking");
    const s = await getDevAdminStatus();
    setStatus(s);
    if (s === "enabled" && !autoTried.current) {
      autoTried.current = true;
      try {
        const session = await devAdminLogin();
        onLogin(session);
      } catch {
        /* نخلي المستخدم يضغط الزر يدوياً لو فشل التلقائي */
      }
    }
  }, [onLogin]);

  useEffect(() => { check(); }, [check]);

  async function handleDevLogin() {
    setError("");
    setLoading(true);
    try {
      const session = await devAdminLogin();
      onLogin(session);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "تعذّر الدخول التجريبي");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const session = mode === "admin" ? await adminLogin(password) : await adminHelperLogin(password);
      onLogin(session);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطأ في تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div id="bg" style={{ backgroundImage: `url(${bgImg})` }} />
      <div id="bg-grad" />
      <div style={{ position: "relative", zIndex: 2, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div className="login-card">
          <div style={{ fontSize: "2.5rem", marginBottom: "16px" }}>🔐</div>
          <h2>لوحة التحكم</h2>

          {status === "checking" && (
            <p style={{ marginTop: "8px" }}>...جاري التحقق</p>
          )}

          {/* الخادم مو شغّال: نوضّح المشكلة الحقيقية بدل نموذج كلمة المرور */}
          {status === "unreachable" && (
            <>
              <p style={{ color: "#ffb020" }}>⚠️ خادم الـ API غير متصل</p>
              <p style={{ fontSize: "0.8rem", opacity: 0.75, lineHeight: 1.8, marginTop: "8px" }}>
                شغّل خادم الـ API من جذر المشروع ثم أعد المحاولة:
                <br />
                <code style={{ color: "var(--blue)" }}>node artifacts/api-server/dist/index.mjs</code>
              </p>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: "100%", marginTop: "16px" }}
                onClick={check}
              >
                🔄 إعادة المحاولة
              </button>
            </>
          )}

          {/* الملف موجود: دخول بدون كلمة مرور */}
          {status === "enabled" && (
            <>
              <p>الأدمن التجريبي مفعّل — تقدر تدخل بدون كلمة مرور</p>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: "100%", marginTop: "6px" }}
                onClick={handleDevLogin}
                disabled={loading}
              >
                {loading ? "جاري الدخول..." : "🔓 دخول تجريبي"}
              </button>
              {error && <div className="login-error" style={{ marginTop: "12px" }}>{error}</div>}
            </>
          )}

          {/* الخادم شغّال بس الملف غير موجود: نموذج كلمة المرور */}
          {status === "disabled" && (
            <>
              <div style={{ display: "flex", gap: "8px", marginBottom: "14px", justifyContent: "center" }}>
                <button
                  type="button"
                  className={`btn ${mode === "admin" ? "btn-primary" : "btn-ghost"}`}
                  style={{ padding: "6px 16px", fontSize: "0.85rem" }}
                  onClick={() => { setMode("admin"); setPassword(""); setError(""); }}
                >
                  🔐 أدمن رئيسي
                </button>
                <button
                  type="button"
                  className={`btn ${mode === "helper" ? "btn-primary" : "btn-ghost"}`}
                  style={{ padding: "6px 16px", fontSize: "0.85rem" }}
                  onClick={() => { setMode("helper"); setPassword(""); setError(""); }}
                >
                  🙋 مساعد
                </button>
              </div>
              <p>
                {mode === "admin"
                  ? "أدخل كلمة المرور للوصول إلى لوحة إدارة البطولة"
                  : "أدخل كود المساعد اللي أعطاك إياه الأدمن"}
              </p>
              <form onSubmit={handleSubmit}>
                <input
                  type={mode === "admin" ? "password" : "text"}
                  className="login-input"
                  placeholder={mode === "admin" ? "••••••••" : "كود المساعد"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoFocus
                  style={mode === "helper" ? { textAlign: "center", letterSpacing: "3px", fontWeight: 800 } : undefined}
                />
                {error && <div className="login-error">{error}</div>}
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: "100%" }}
                  disabled={loading || !password}
                >
                  {loading ? "جاري التحقق..." : "دخول 🚀"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}