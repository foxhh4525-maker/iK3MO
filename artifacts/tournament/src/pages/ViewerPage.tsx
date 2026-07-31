import { useState, useEffect } from "react";

import bgImg from "@assets/ik3mo-bg-1280_1782771571176.jpg";
import { defaultState, type TournamentState } from "@/lib/types";
import { getState, useSSE } from "@/lib/api";
import BracketDisplay from "@/components/BracketDisplay";

export default function ViewerPage() {
  const [st, setSt] = useState<TournamentState>(defaultState());
  const [connected, setConnected] = useState(false);
  // نبضة كل ثانية عشان عداد نافذة الانضمام يتحدث بالواجهة
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!st.joinDeadline) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [st.joinDeadline]);

  // 🏷️ عنوان تبويب المتصفح — نفس أسلوب صفحة الأدمن، ونرجّع العنوان
  // الأصلي عند الخروج من الصفحة عشان ما يعلق على بقية الصفحات.
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "لوحة البطولة 🎮 | IK3MO";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  // ✅ useEffect يراقب تغير phase للتأكد من الاستجابة الفورية
  useEffect(() => {
    console.log("[Viewer] Phase changed to:", st.phase, "rounds:", st.rounds?.length);
  }, [st.phase]);

  // ✅ useSSE callback مبسط - يحدث الـ state فقط بدون side effects
  // 🔄 جلب الحالة مرة عند الفتح — SSE يبث عند الاتصال، لكن لو تأخر أو
  // انقطع (Render cold start / إعادة تشغيل الخادم / إغلاق مصدر OBS وفتحه)
  // تظل الصفحة على الحالة الافتراضية وتقول "البطولة لسا ما بدأت" وهي بادية.
  // هذا الطلب المباشر يضمن الحالة الصحيحة فوراً.
  useEffect(() => {
    getState().then((s) => { if (s) setSt(s); }).catch(() => {});
  }, []);

  useSSE((data) => {
    console.log("[Viewer] SSE received, phase:", data.phase, "rounds:", data.rounds?.length);
    setSt(data);
    setConnected(true);
  });

  // 🔵 المدة الكلية للبوابة — نلتقطها أول ما تُفتح عشان نحسب نسبة الحلقة.
  // ما تعتمد على أي حقل جديد بالخادم: نأخذ المتبقي وقت ما وصلنا الموعد.
  const [joinTotal, setJoinTotal] = useState(0);
  useEffect(() => {
    if (!st.joinDeadline) { setJoinTotal(0); return; }
    setJoinTotal(Math.max(1, Math.ceil((st.joinDeadline - Date.now()) / 1000)));
  }, [st.joinDeadline]);

  function getJoinSecondsLeft(): number {
    if (!st.joinDeadline) return 0;
    return Math.max(0, Math.ceil((st.joinDeadline - Date.now()) / 1000));
  }
  const joinWindowOpen = !!st.joinDeadline && getJoinSecondsLeft() > 0;
  const joinedPlayers = st.entryLog;

  return (
    <>
      <style>{`
        .glass-card {
          background: rgba(0, 0, 0, 0.58);
          border: 1px solid rgba(255,255,255,0.14);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          box-shadow: 0 16px 40px rgba(0,0,0,0.35);
        }

        /* ===== ⬅️ زر الرجوع للرئيسية ===== */
        /* زجاجي بحدّ متدرّج، والسهم يتحرك مع المرور عليه */
        .viewer-back-btn{
          position: fixed; top: 16px; left: 16px; z-index: 50;
          display: inline-flex; align-items: center; gap: 9px;
          padding: 10px 20px 10px 16px; border-radius: 999px;
          color: #eaf6ff; font-weight: 800; font-size: 0.84rem;
          font-family: Cairo, sans-serif; letter-spacing: .2px;
          text-decoration: none; white-space: nowrap;
          background: linear-gradient(180deg, rgba(41,182,246,.18), rgba(4,10,22,.72));
          border: 1px solid rgba(120,212,255,.42);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.16), 0 8px 22px rgba(0,0,0,.45);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          transition: transform .2s ease, box-shadow .2s ease,
                      border-color .2s ease, background .2s ease;
        }
        .viewer-back-btn:hover{
          transform: translateY(-2px);
          border-color: #7fd4ff;
          background: linear-gradient(180deg, rgba(41,182,246,.32), rgba(4,10,22,.75));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.22), 0 12px 28px rgba(41,182,246,.3);
        }
        .viewer-back-btn:active{ transform: translateY(0) }
        .viewer-back-arrow{
          font-size: 1rem; line-height: 1; display: inline-block;
          transition: transform .2s ease;
        }
        .viewer-back-btn:hover .viewer-back-arrow{ transform: translateX(-4px) }

        /* ===== 🏠 زر العودة بعد انتهاء البطولة ===== */
        .viewer-home-btn{
          display: inline-flex; align-items: center; gap: 10px;
          padding: 14px 32px; border-radius: 999px;
          font-family: Cairo, sans-serif; font-weight: 900; font-size: 1rem;
          color: #fff; text-decoration: none; white-space: nowrap;
          background: linear-gradient(135deg, #39c4ff 0%, #1976e6 55%, #0d4fb0 100%);
          border: 1px solid rgba(255,255,255,.24);
          box-shadow: 0 10px 26px rgba(25,118,230,.45),
                      inset 0 1px 0 rgba(255,255,255,.28);
          transition: transform .2s ease, box-shadow .2s ease, filter .2s ease;
        }
        .viewer-home-btn:hover{
          transform: translateY(-3px); filter: brightness(1.07);
          box-shadow: 0 16px 34px rgba(25,118,230,.6),
                      inset 0 1px 0 rgba(255,255,255,.35);
        }
        .viewer-home-btn:active{ transform: translateY(0) }
        .viewer-home-row{
          display: flex; justify-content: center;
          margin-top: 28px;
        }

        @media (max-width: 640px){
          .viewer-back-btn{ top: 12px; left: 12px; padding: 8px 16px 8px 13px; font-size: .78rem }
          .viewer-home-btn{ padding: 12px 26px; font-size: .92rem }
        }
        /* ═══════════ 🖥️ الشجرة على عرض الشاشة كاملة ═══════════
           خاص بصفحة العرض (.viewer-shell) فقط — صفحة /bracket الخاصة
           بالشاشة الخضراء ما تتأثر إطلاقاً لأنها ما تستخدم هذا الكلاس.

           ثلاثة قيود كانت تمنع الشجرة تملأ العرض:
           1) .main > div عليه max-width:1600px
           2) حشوة .main الجانبية
           3) أعمدة الجولات عليها max-width فما تكبر مهما كانت المساحة
           نلغيهم هنا ونخلي الأعمدة تتقاسم العرض بالتساوي (flex:1 1 0).
           المسافة بين الأعمدة (gap) تبقى ثابتة، فخطوط الربط تظل مضبوطة. */
        .viewer-shell .main{ padding-left: 10px; padding-right: 10px }
        .viewer-shell .main > div{ max-width: none }
        .viewer-shell .bracket-scroll{ width: 100% }
        .viewer-shell .bracket{ width: 100%; justify-content: center }
        .viewer-shell .round,
        .viewer-shell .round.r-fwd,
        .viewer-shell .round.r-left,
        .viewer-shell .round.r-right{ max-width: none; flex: 1 1 0 }
        .viewer-shell .round.r-center{ max-width: none; flex: 1 1 0 }

        /* مساحة أوسع = أسماء أكبر وأوضح للمشاهد */
        @media (min-width: 1100px){
          .viewer-shell .bracket{ --row: 48px; --conn: 20px }
          .viewer-shell .p-name{ font-size: 1.14rem }
          .viewer-shell .p-badge{ width: 28px; height: 28px; font-size: .84rem }
          .viewer-shell .round.r-center .player .p-name{ font-size: 1.24rem }
        }

      `}</style>
      <div id="bg" style={{ backgroundImage: `url(${bgImg})` }} />
      <div id="bg-grad" />

      <a className="viewer-back-btn" href="/" aria-label="الرجوع للصفحة الرئيسية">
        <span className="viewer-back-arrow" aria-hidden="true">←</span>
        الرئيسية
      </a>

      <div className="viewer-badge">
        <div className="viewer-badge-dot" />
        {connected ? "بث مباشر" : "جاري الاتصال..."}
      </div>

      <div className="shell viewer-shell">
        {/* MAIN */}
        <div className="main">
          <div style={{ width: "100%", margin: "0 auto" }}>
            <header className="site-header">
              <h1>iK3MO</h1>
              <p>شاهد البطولة مباشرة</p>
            </header>

            {st.phase === "setup" ? (
              <div className="waiting-screen">
                {/* ⏳ لوحة بوابة الانضمام — حلقة تفرغ مع الوقت بدل الرمز الدوّار */}
                <div
                  className={`gate${!st.joinDeadline ? "" : !joinWindowOpen ? " is-closed" : getJoinSecondsLeft() <= 10 ? " is-hot" : ""}`}
                >
                  {st.name && (st.joinDeadline || joinWindowOpen) && (
                    <div className="gate-title">🏆 {st.name}</div>
                  )}

                  {st.joinDeadline ? (
                    <>
                      <div
                        className="gate-ring"
                        style={{ ["--p" as any]: joinTotal ? Math.max(0, getJoinSecondsLeft() / joinTotal) : 0 }}
                      >
                        <svg viewBox="0 0 120 120" aria-hidden="true">
                          <circle className="gate-track" cx="60" cy="60" r="52" />
                          <circle className="gate-bar" cx="60" cy="60" r="52" />
                        </svg>
                        <div className="gate-face">
                          <div className="gate-time">
                            {joinWindowOpen
                              ? `${String(Math.floor(getJoinSecondsLeft() / 60)).padStart(2, "0")}:${String(getJoinSecondsLeft() % 60).padStart(2, "0")}`
                              : "00:00"}
                          </div>
                          <div className="gate-unit">{joinWindowOpen ? "متبقي" : "انتهى"}</div>
                        </div>
                      </div>

                      <div className="gate-status">
                        <span className="gate-dot" />
                        {joinWindowOpen ? "باب الانضمام مفتوح" : "باب الانضمام مقفل"}
                      </div>

                      {joinWindowOpen && (
                        <div className="gate-hint">
                          اكتب <b>دخول</b> بالشات عشان تشارك
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="gate-wait" aria-hidden="true"><i /><i /><i /></div>
                      <div className="gate-status">
                        <span className="gate-dot" />
                        في انتظار بدء البطولة
                      </div>
                      <div className="gate-hint">ستظهر البطولة هنا تلقائياً عند انطلاقها</div>
                    </>
                  )}

                  {joinedPlayers.length > 0 && (
                    <div className="gate-count">👥 المنضمين <span>{joinedPlayers.length}</span></div>
                  )}
                </div>

                {/* 👥 اللاعبون المنضمين */}
                {joinedPlayers.length > 0 && (
                  <div style={{ marginTop: "26px", width: "100%", maxWidth: "720px" }}>
                    <p
                      style={{
                        fontSize: "1rem",
                        fontWeight: 800,
                        opacity: 0.85,
                        marginBottom: "14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                      }}
                    >
                      👥 اللاعبون المنضمين
                      <span
                        style={{
                          background: "var(--kick, #53fc18)",
                          color: "#062b00",
                          borderRadius: "999px",
                          padding: "2px 12px",
                          fontSize: "0.9rem",
                          fontWeight: 900,
                        }}
                      >
                        {joinedPlayers.length}
                      </span>
                    </p>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                        gap: "12px",
                        justifyItems: "stretch",
                      }}
                    >
                      {joinedPlayers.map((e, i) => (
                        <div
                          key={i}
                          className="glass-card"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "10px 14px",
                            borderRadius: "14px",
                          }}
                        >
                          {e.avatar ? (
                            <img
                              src={e.avatar}
                              alt={e.user}
                              referrerPolicy="no-referrer"
                              style={{
                                width: "38px",
                                height: "38px",
                                borderRadius: "50%",
                                objectFit: "cover",
                                border: "2px solid var(--kick, #53fc18)",
                                flexShrink: 0,
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "38px",
                                height: "38px",
                                borderRadius: "50%",
                                background: "linear-gradient(135deg, #14b8a6, #0f172a)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "1rem",
                                fontWeight: 900,
                                flexShrink: 0,
                                border: "2px solid rgba(255,255,255,0.2)",
                              }}
                            >
                              {e.user.charAt(0).toUpperCase()}
                            </div>
                          )}
                          {/* 🔤 الاسم كامل — يلتف على سطرين بدل ما يتقصّ */}
                          <span
                            style={{
                              fontSize: "0.95rem",
                              fontWeight: 700,
                              minWidth: 0,
                              whiteSpace: "normal",
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                              lineHeight: 1.35,
                            }}
                          >
                            {e.user}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>

                <div className="toolbar">
                  <div className="toolbar-info" />
                  <div className="toolbar-info" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                    <span style={{ color: "var(--gold)", fontWeight: 900, fontSize: "clamp(1rem,3vw,1.3rem)", whiteSpace: "nowrap", textShadow: "0 0 12px rgba(255,215,0,0.6)" }}>
                      🏆 {st.name || "IK3MO"}
                    </span>
                    {st.gameType && (
                      <span style={{ color: "var(--gold)", fontWeight: 700, fontSize: "clamp(0.75rem,2vw,0.95rem)", whiteSpace: "nowrap", opacity: 0.9 }}>
                        {st.gameType}
                      </span>
                    )}
                  </div>
                  <div className="toolbar-info" style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span>{st.isTeams ? "الفرق:" : "اللاعبون:"}</span>{" "}
                    <b>{st.players.length}</b>
                    {st.byeN > 0 && <span style={{ color: "var(--blue)" }}>(بايب: {st.byeN})</span>}
                    <span style={{ opacity: 0.5 }}>·</span>
                    <span>الجولة:</span> <b>{st.cur + 1}</b>
                  </div>
                </div>

                <BracketDisplay st={st} isAdmin={false} pickedMatchId={st.pickedMatchId ?? null} />

                {/* ✅ لما تنتهي البطولة (يتحدد البطل) يظهر زر للزوار يرجعهم للصفحة الرئيسية */}
                {st.champion && (
                  <div className="viewer-home-row">
                    <a className="viewer-home-btn" href="/">
                      <span aria-hidden="true">🏠</span>
                      العودة للصفحة الرئيسية
                    </a>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
