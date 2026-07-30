import { useState, useEffect } from "react";

import bgImg from "@assets/ik3mo-bg-1280_1782771571176.jpg";
import iconImg from "@assets/kemo1_1.icon_1782771567876.png";
import { defaultState, type TournamentState } from "@/lib/types";
import { useSSE } from "@/lib/api";
import BracketDisplay from "@/components/BracketDisplay";

export default function ViewerPage() {
  const [st, setSt] = useState<TournamentState>(defaultState());
  const [connected, setConnected] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(true);
  // نبضة كل ثانية عشان عداد نافذة الانضمام يتحدث بالواجهة
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!st.joinDeadline) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [st.joinDeadline]);

  // ✅ useEffect يراقب تغير phase للتأكد من الاستجابة الفورية
  useEffect(() => {
    console.log("[Viewer] Phase changed to:", st.phase, "rounds:", st.rounds?.length);
  }, [st.phase]);

  // ✅ useSSE callback مبسط - يحدث الـ state فقط بدون side effects
  useSSE((data) => {
    console.log("[Viewer] SSE received, phase:", data.phase, "rounds:", data.rounds?.length);
    setSt(data);
    setConnected(true);
  });

  const participantCount = st.phase === "setup"
    ? st.entryLog.length
    : (st.players?.length || st.entryLog.length);
  const gameMeta =
    st.gameType === "Rocket League"
      ? { icon: "🚗", subtitle: "بطولة سريعة ومنافسة عالية", accent: "linear-gradient(135deg, #0ea5e9, #1d4ed8)", glow: "rgba(14, 165, 233, 0.42)" }
      : st.gameType === "Roblox"
        ? { icon: "🎮", subtitle: "واجهة ممتعة واحترافية للمشاركين", accent: "linear-gradient(135deg, #8b5cf6, #4338ca)", glow: "rgba(139, 92, 246, 0.42)" }
        : st.gameType === "بروهاله"
          ? { icon: "🏆", subtitle: "بطولة فريدة ذات طابع خاص", accent: "linear-gradient(135deg, #f59e0b, #b45309)", glow: "rgba(245, 158, 11, 0.42)" }
          : { icon: "✨", subtitle: "استعد للانطلاق والتميز", accent: "linear-gradient(135deg, #14b8a6, #0f172a)", glow: "rgba(20, 184, 166, 0.42)" };

  const recentJoiners = [...st.entryLog].reverse().slice(0, 5);

  function getJoinSecondsLeft(): number {
    if (!st.joinDeadline) return 0;
    return Math.max(0, Math.ceil((st.joinDeadline - Date.now()) / 1000));
  }
  const joinWindowOpen = !!st.joinDeadline && getJoinSecondsLeft() > 0;
  const joinedPlayers = st.entryLog;

  return (
    <>
      <style>{`
        @keyframes floatGlow {
          0%, 100% { transform: translateY(0px) scale(1); opacity: 0.7; }
          50% { transform: translateY(-8px) scale(1.04); opacity: 1; }
        }
        @keyframes participantsPulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.25); }
        }
        .game-card-hover {
          transition: transform 180ms ease, box-shadow 180ms ease;
        }
        .game-card-hover:hover {
          transform: translateY(-4px);
          box-shadow: 0 24px 55px rgba(0,0,0,0.35);
        }
        .glass-card {
          background: rgba(0, 0, 0, 0.58);
          border: 1px solid rgba(255,255,255,0.14);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          box-shadow: 0 16px 40px rgba(0,0,0,0.35);
        }
        .game-orb {
          animation: floatGlow 3.2s ease-in-out infinite;
        }
        .participants-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
          border-radius: 20px;
          padding: 14px 20px;
          margin-bottom: 18px;
        }
        .participants-bar-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .participants-icon {
          width: 46px;
          height: 46px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.3rem;
          flex: 0 0 auto;
          box-shadow: 0 8px 20px rgba(0,0,0,0.35);
        }
        .participants-label {
          font-size: 0.78rem;
          color: var(--muted);
          font-weight: 700;
          margin-bottom: 2px;
        }
        .participants-count {
          font-size: 1.5rem;
          font-weight: 900;
          color: #fff;
          display: flex;
          align-items: baseline;
          gap: 6px;
        }
        .participants-suffix {
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--muted);
        }
        .participants-bar-right {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--kick);
          background: rgba(83,252,24,0.1);
          border: 1px solid rgba(83,252,24,0.3);
          padding: 6px 12px;
          border-radius: 999px;
          white-space: nowrap;
        }
        .participants-live-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--kick);
          animation: participantsPulse 1.5s ease-in-out infinite;
          box-shadow: 0 0 8px rgba(83,252,24,0.7);
        }
        .participants-bar { border: 1px solid rgba(83,252,24,0.22); }
        .participants-avatars { display: flex; align-items: center; margin-inline-start: 6px; }
        .participant-avatar-wrap {
          width: 30px; height: 30px; border-radius: 50%;
          border: 2px solid var(--bg);
          box-shadow: 0 0 0 1px rgba(83,252,24,0.55), 0 4px 10px rgba(0,0,0,0.4);
          overflow: hidden; margin-inline-start: -10px;
          background: linear-gradient(135deg, var(--kick), var(--blue));
          flex-shrink: 0; animation: slideIn 0.35s ease-out;
        }
        .participant-avatar-wrap:first-child { margin-inline-start: 0; }
        .participant-avatar-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
        @keyframes slideIn { from { opacity:0; transform:translateX(10px) scale(0.8); } to { opacity:1; transform:translateX(0) scale(1); } }
        .participants-names-row {
          margin-top: 4px; font-size: 0.72rem; color: var(--muted);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px;
        }
        .participants-names-row b { color: var(--kick); font-weight: 800; }
        .viewer-back-btn{
          position: fixed; top: 16px; left: 16px; z-index: 50;
          display: flex; align-items: center; gap: 8px;
          padding: 9px 16px; border-radius: 999px;
          background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.18);
          color: #fff; font-weight: 700; font-size: 0.82rem; text-decoration: none;
          backdrop-filter: blur(8px); transition: all .2s ease;
        }
        .viewer-back-btn:hover{ background: rgba(41,182,246,0.25); border-color: rgba(41,182,246,0.5); transform: translateY(-2px); }
      `}</style>
      <div id="bg" style={{ backgroundImage: `url(${bgImg})` }} />
      <div id="bg-grad" />

      <a className="viewer-back-btn" href="/" aria-label="الرجوع للصفحة الرئيسية">
        ← الرئيسية
      </a>

      <div className="viewer-badge">
        <div className="viewer-badge-dot" />
        {connected ? "بث مباشر" : "جاري الاتصال..."}
      </div>

      <div className={`shell viewer-shell${sidebarHidden ? "" : " chat-open"}`}>
        {/* MAIN */}
        <div className="main">
          <div style={{ width: "100%", margin: "0 auto" }}>
            <header className="site-header">
              <div className="tag">iK3MO</div>
              <h1>iK3MO</h1>
              <p>شاهد البطولة مباشرة</p>
            </header>

            <div className="participants-bar glass-card" style={{ background: `linear-gradient(160deg, rgba(41,182,246,0.22), rgba(0,20,45,0.75))`, border: "1px solid rgba(41,182,246,0.35)", boxShadow: `0 14px 34px ${gameMeta.glow}` }}>
              <div className="participants-bar-left">
                <div className="participants-icon" style={{ background: gameMeta.accent }}>👥</div>
                <div>
                  <div className="participants-label">{st.isTeams ? "الفرق المشاركة" : "اللاعبون المشاركون"}</div>
                  <div className="participants-count">
                    {participantCount}
                    <span className="participants-suffix">{st.isTeams ? "فريق" : "لاعب"}</span>
                    {recentJoiners.length > 0 && (
                      <div className="participants-avatars">
                        {recentJoiners.map((e, i) => (
                          <div className="participant-avatar-wrap" key={i} title={e.user}>
                            <img
                              src={e.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(e.user)}&backgroundType=gradientLinear&backgroundColor=53fc18,29b6f6&textColor=060d1a&fontWeight=800`}
                              alt={e.user}
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {recentJoiners.length > 0 && (
                    <div className="participants-names-row">
                      آخر انضمام: <b>{recentJoiners[0].user}</b>
                      {recentJoiners.length > 1 && ` +${recentJoiners.length - 1} آخرين`}
                    </div>
                  )}
                </div>
              </div>
              <div
                className="participants-bar-right"
                style={
                  (st.phase === "setup" && !joinWindowOpen)
                    ? { color: "#ff4444", background: "rgba(255,68,68,0.1)", border: "1px solid rgba(255,68,68,0.35)" }
                    : undefined
                }
              >
                <span
                  className="participants-live-dot"
                  style={
                    (st.phase === "setup" && !joinWindowOpen)
                      ? { background: "#ff4444", boxShadow: "0 0 8px rgba(255,68,68,0.7)" }
                      : undefined
                  }
                />
                {st.phase !== "setup" ? "البطولة جارية الآن" : joinWindowOpen ? "التسجيل مفتوح الآن" : "التسجيل مغلق حالياً"}
              </div>
            </div>


            {st.phase === "setup" ? (
              <div className="waiting-screen">
                <div className="waiting-icon">⏳</div>
                {/* 🏆 اسم البطولة يظهر فقط بعد ما الأدمن يفتح باب الانضمام */}
                {st.name && joinWindowOpen && (
                  <span
                    style={{
                      color: "var(--gold)",
                      fontWeight: 900,
                      fontSize: "clamp(1rem,3vw,1.3rem)",
                      textShadow: "0 0 12px rgba(255,215,0,0.6)",
                      marginBottom: "6px",
                    }}
                  >
                    🏆 {st.name}
                  </span>
                )}
                <p>في انتظار بدء البطولة...</p>
                <p style={{ fontSize: "0.8rem", opacity: 0.5 }}>
                  ستظهر البطولة هنا تلقائياً عند انطلاقها
                </p>

                {/* ⏱️ نافذة الانضمام — تظهر فقط لما الأدمن يفتحها */}
                {st.joinDeadline && (
                  <div
                    style={{
                      marginTop: "18px",
                      padding: "12px 20px",
                      borderRadius: "12px",
                      background: "rgba(0,0,0,0.4)",
                      border: "1px solid rgba(255,255,255,0.14)",
                      display: "inline-flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <span style={{ fontSize: "0.85rem", color: "var(--muted, #aaa)" }}>
                      {joinWindowOpen ? "⏱️ باب الانضمام مفتوح" : "⛔ باب الانضمام مقفل"}
                    </span>
                    <span
                      style={{
                        fontWeight: 900,
                        fontSize: "1.6rem",
                        color: !joinWindowOpen ? "#ef4444" : getJoinSecondsLeft() <= 10 ? "#ef4444" : "var(--blue)",
                      }}
                    >
                      {joinWindowOpen
                        ? `${String(Math.floor(getJoinSecondsLeft() / 60)).padStart(2, "0")}:${String(getJoinSecondsLeft() % 60).padStart(2, "0")}`
                        : "⛔"}
                    </span>
                    {joinWindowOpen && (
                      <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>اكتب !دخول بالشات عشان تنضم</span>
                    )}
                  </div>
                )}

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
                          <span
                            style={{
                              fontSize: "0.95rem",
                              fontWeight: 700,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
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
                  <div style={{ display: "flex", justifyContent: "center", marginTop: "24px" }}>
                    <a
                      href="https://kemo-tournament.onrender.com/"
                      className="btn btn-primary"
                      style={{ padding: "12px 28px", fontSize: "0.95rem", textDecoration: "none", display: "inline-block" }}
                    >
                      🏠 العودة للصفحة الرئيسية
                    </a>
                  </div>
                )}
              </>
            )}
          </div>
        </div>


        {/* SIDEBAR */}
        <div className={`sidebar${sidebarHidden ? " sidebar-hidden" : ""}`}>
          <div className="sidebar-head">
            <div className="kick-badge">
              <img src={iconImg} alt="iK3MO" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div className="sidebar-title">iK3MO</div>
            <div className="live-pill pill-offline">⚫ شات</div>
          </div>
          <div className="chat-body">
            <div className="chat-frame-container">
              <iframe
                src="https://kick.com/popout/ik3mo/chat"
                allow="autoplay;fullscreen"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              />
            </div>
            <div className="entry-log-container">
              <div className="entry-log-head">
                <span>👥 {st.isTeams ? "الفرق المسجلة" : "المسجلين من الشات"}</span>
                <span style={{ color: "var(--kick)" }}>{st.entryLog.length}</span>
              </div>
              <div className="entry-log-list">
                {[...st.entryLog].reverse().map((e, i) => (
                  <div key={i} className="entry-item">
                    {e.avatar ? (
                      <img className="avatar" src={e.avatar} alt={e.user} referrerPolicy="no-referrer" />
                    ) : (
                      <div className="status-dot" />
                    )}
                    <div className="user">{e.user}</div>
                    <div className="time">{e.time}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar toggle */}
      <button
        className={`sidebar-toggle${!sidebarHidden ? " sb-active" : ""}`}
        onClick={() => setSidebarHidden(h => !h)}
        title={sidebarHidden ? "إظهار الشات" : "إخفاء الشات"}
      >
        <span>💬</span>
        <span style={{ fontSize: "0.82rem", fontFamily: "Cairo, sans-serif", fontWeight: 700 }}>
          {sidebarHidden ? "الشات" : "إخفاء"}
        </span>
      </button>
    </>
  );
}