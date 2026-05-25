import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "sonner";
import { bootstrapCeo, hasAnyUsers } from "@/lib/admin-users.functions";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

// ── Brand mark ────────────────────────────────────────────────────────────────
function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="0"  y="0"  width="10" height="10" rx="2" fill="var(--color-status-notstarted)" />
      <rect x="12" y="0"  width="10" height="10" rx="2" fill="var(--color-status-working)" />
      <rect x="0"  y="12" width="10" height="10" rx="2" fill="var(--color-status-stuck)" />
      <rect x="12" y="12" width="10" height="10" rx="2" fill="var(--color-status-done)" />
    </svg>
  );
}

// ── Eye toggle icon ────────────────────────────────────────────────────────────
function EyeIcon({ closed }: { closed: boolean }) {
  return closed ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// ── Arrow icon ────────────────────────────────────────────────────────────────
function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

// ── Alert icon ────────────────────────────────────────────────────────────────
function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.5 2.5 17a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.5a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

// ── Decorative large outlined mark ────────────────────────────────────────────
function PosterDeco() {
  return (
    <svg
      style={{ position: "absolute", bottom: -60, insetInlineEnd: -60, width: 320, height: 320, opacity: 0.6, pointerEvents: "none" }}
      viewBox="0 0 320 320" aria-hidden="true"
    >
      <g fill="none" stroke="var(--color-border)" strokeWidth="1.5">
        <rect x="10"  y="10"  width="140" height="140" rx="20" />
        <rect x="170" y="10"  width="140" height="140" rx="20" />
        <rect x="10"  y="170" width="140" height="140" rx="20" />
        <rect x="170" y="170" width="140" height="140" rx="20" />
      </g>
    </svg>
  );
}

// ── Poster status stat card ────────────────────────────────────────────────────
function PosterStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 6,
      padding: "10px 12px",
      background: "var(--color-muted)",
      borderRadius: 8,
      borderTop: `2px solid ${color}`,
    }}>
      <span className="font-mono-pt" style={{ fontSize: 10, color: "var(--color-muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <span className="font-mono-pt" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color, lineHeight: 1 }}>
        {value}
      </span>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <span style={{
      display: "inline-block",
      width: 14, height: 14,
      border: "2px solid currentColor",
      borderRightColor: "transparent",
      borderRadius: "50%",
      animation: "pt-login-spin 0.7s linear infinite",
    }} />
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function LoginPage() {
  const { session, loading } = useAuth();
  const { t, lang, toggle } = useI18n();
  const nav = useNavigate();
  const checkUsers = useServerFn(hasAnyUsers);
  const bootstrap  = useServerFn(bootstrapCeo);

  const { data: usersCheck } = useQuery({
    queryKey: ["has-any-users"],
    queryFn: () => checkUsers(),
  });

  useEffect(() => {
    if (!loading && session) nav({ to: "/dashboard" });
  }, [loading, session, nav]);

  const [mode, setMode]         = useState<"login" | "bootstrap">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [busy, setBusy]         = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (usersCheck && !usersCheck.hasUsers) setMode("bootstrap");
    else setMode("login");
  }, [usersCheck]);

  const isBootstrap = mode === "bootstrap";
  const toEmail = (u: string) => `${u.trim().toLowerCase()}@past-task.local`;
  const emailPreview = username ? `${username.trim().toLowerCase()}@past-task.local` : "username@past-task.local";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setBusy(true);
    try {
      if (isBootstrap) {
        await bootstrap({ data: { username: username.trim().toLowerCase(), password, full_name: fullName } });
        const { error } = await supabase.auth.signInWithPassword({ email: toEmail(username), password });
        if (error) throw error;
        toast.success(t("ceo_created"));
        nav({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: toEmail(username), password });
        if (error) throw error;
        nav({ to: "/dashboard" });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Incorrect username or password.");
    } finally {
      setBusy(false);
    }
  };

  const isRtl = lang === "ar";

  // ── i18n strings ──────────────────────────────────────────────────────────
  const strings = isRtl ? {
    appTag: "الفريق الداخلي",
    welcomeBack: "أهلًا بعودتك إلى",
    welcomeFirst: "لنبدأ بإعداد",
    loginSub: "سجّل الدخول باسم المستخدم وكلمة المرور الخاصين بالفريق.",
    bootstrapSub: "لا يوجد مستخدمون بعد. أنشئ حساب المسؤول الأول للبدء.",
    bootstrapBadge: "إعداد لأول مرة",
    fullNameLabel: "الاسم الكامل",
    usernameLabel: "اسم المستخدم",
    usernameHelper: "أحرف صغيرة بلا مسافات.",
    passwordLabel: "كلمة المرور",
    passwordHelper: "٨ أحرف على الأقل.",
    show: "إظهار", hide: "إخفاء",
    signIn: "تسجيل الدخول",
    createAdmin: "أنشئ حساب المسؤول",
    pleaseWait: "يرجى الانتظار…",
    noSignup: "لا يوجد تسجيل ذاتي. اطلب من المسؤول إضافتك إلى الفريق.",
    posterEyebrow: "مساحة عمل الفريق الداخلي",
    posterTitleA: "العمل",
    posterTitleB: "مستمر اليوم.",
    posterSub: "مصدر واحد للحقيقة لما هو متوقف، وما يتحرّك، وما تم إنجازه للتو.",
    glassHead: "مباشر · الأسبوع ٢٢",
    credo: "“الإنجاز حالة، لا شعور.”",
    footerStatus: "جميع الأنظمة تعمل",
    footerVer: "Past-Task v2 · 2026.05",
    footerHelp: "تحتاج مساعدة؟",
    footerPrivacy: "الخصوصية",
  } : {
    appTag: "INTERNAL · TEAM",
    welcomeBack: "Welcome back to",
    welcomeFirst: "Let's set up",
    loginSub: "Sign in with your team username and password.",
    bootstrapSub: "No users yet. Create the first admin account to get started.",
    bootstrapBadge: "First-time setup",
    fullNameLabel: "Full name",
    usernameLabel: "Username",
    usernameHelper: "Lowercase, no spaces.",
    passwordLabel: "Password",
    passwordHelper: "At least 8 characters.",
    show: "Show", hide: "Hide",
    signIn: "Sign in",
    createAdmin: "Create admin account",
    pleaseWait: "Please wait…",
    noSignup: "No self sign-up. Ask an admin to add you to the team.",
    posterEyebrow: "Internal team workspace",
    posterTitleA: "The work",
    posterTitleB: "continues today.",
    posterSub: "A single source of truth for what's stuck, what's moving, and what just shipped.",
    glassHead: "Live · Week 22",
    credo: "“Done is a status, not a feeling.”",
    footerStatus: "All systems operational",
    footerVer: "Past-Task v2 · 2026.05",
    footerHelp: "Need help?",
    footerPrivacy: "Privacy",
  };

  return (
    <>
      {/* Inject keyframe for spinner — only once */}
      <style>{`
        @keyframes pt-login-spin { to { transform: rotate(360deg); } }
        @keyframes pt-login-pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        .pt-input-wrap { display:flex; align-items:stretch; background:var(--color-card); border:1px solid var(--color-border); border-radius:8px; transition:border-color 0.12s, box-shadow 0.12s; overflow:hidden; }
        .pt-input-wrap:focus-within { border-color:var(--color-primary); box-shadow:0 0 0 3px var(--color-primary-soft, oklch(0.94 0.03 280)); }
        .pt-input-wrap.error { border-color:var(--color-status-stuck); box-shadow:0 0 0 3px oklch(0.95 0.04 25); }
        .pt-input { flex:1; min-width:0; height:42px; padding:0 14px; font-size:14px; color:var(--color-foreground); background:transparent; border:none; outline:none; font-family:inherit; }
        .pt-input::placeholder { color:var(--color-muted-foreground); }
        .pt-eye-btn { padding:0 12px; color:var(--color-muted-foreground); display:inline-flex; align-items:center; border-inline-start:1px solid var(--color-border); background:var(--color-muted); cursor:pointer; transition:color 0.1s; }
        .pt-eye-btn:hover { color:var(--color-foreground); }
        .pt-submit { height:44px; border-radius:8px; background:var(--color-primary); color:white; font-size:14px; font-weight:500; display:inline-flex; align-items:center; justify-content:center; gap:8px; width:100%; border:none; cursor:pointer; transition:opacity 0.12s, transform 0.06s; margin-top:8px; font-family:inherit; }
        .pt-submit:hover { opacity:0.92; }
        .pt-submit:active { transform:translateY(0.5px); }
        .pt-submit:disabled { opacity:0.65; cursor:not-allowed; }
      `}</style>

      <div
        dir={isRtl ? "rtl" : "ltr"}
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--color-background)",
          color: "var(--color-foreground)",
          fontFamily: "Geist, system-ui, sans-serif",
          fontSize: 14,
        }}
      >
        {/* ── Top bar ── */}
        <div style={{ padding: "18px 28px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BrandMark size={20} />
            <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: "-0.01em" }}>past-task</span>
          </div>
          <span className="font-mono-pt" style={{
            fontSize: 10, color: "var(--color-muted-foreground)",
            textTransform: "uppercase", letterSpacing: "0.1em",
            padding: "3px 10px", border: "1px solid var(--color-border)", borderRadius: 99,
          }}>
            {strings.appTag}
          </span>
          <div style={{ flex: 1 }} />
          {/* Lang toggle */}
          <div style={{
            display: "inline-flex", alignItems: "center",
            background: "var(--color-muted)", border: "1px solid var(--color-border)",
            borderRadius: 99, padding: 3, gap: 2,
          }}>
            {(["en", "ar"] as const).map((l) => (
              <button
                key={l}
                onClick={toggle}
                style={{
                  padding: "5px 12px", fontSize: 12, borderRadius: 99, border: "none", cursor: "pointer",
                  fontFamily: "inherit",
                  background: lang === l ? "var(--color-card)" : "transparent",
                  color: lang === l ? "var(--color-foreground)" : "var(--color-muted-foreground)",
                  fontWeight: lang === l ? 500 : 400,
                  boxShadow: lang === l ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
                  transition: "all 0.15s",
                }}
              >
                {l === "en" ? "EN" : "ع"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Body: Split layout ── */}
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

          {/* Left poster */}
          <section style={{
            flex: "1.1",
            display: "flex" ,
            flexDirection: "column",
            padding: "48px 56px",
            background: "linear-gradient(180deg, var(--color-muted) 0%, var(--color-background) 100%)",
            borderInlineEnd: "1px solid var(--color-border)",
            position: "relative",
            overflow: "hidden",
            minWidth: 0,
          }}
            className="hidden md:flex"
          >
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 520, position: "relative", zIndex: 2 }}>
              {/* Eyebrow */}
              <div className="font-mono-pt" style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                fontSize: 11, color: "var(--color-muted-foreground)",
                textTransform: "uppercase", letterSpacing: "0.06em",
                marginBottom: 24,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: 99,
                  background: "var(--color-status-working)",
                  animation: "pt-login-pulse 2.4s ease-in-out infinite",
                  display: "inline-block",
                }} />
                {strings.posterEyebrow}
              </div>

              {/* Title */}
              <h1 style={{
                fontSize: 44, fontWeight: 600, letterSpacing: "-0.025em",
                lineHeight: 1.1, marginBottom: 16, maxWidth: 460, margin: "0 0 16px",
              }}>
                {strings.posterTitleA}{" "}
                <span className="font-serif-pt" style={{ color: "var(--color-primary)" }}>
                  {strings.posterTitleB}
                </span>
              </h1>

              <p style={{ fontSize: 15, color: "var(--color-muted-foreground)", lineHeight: 1.5, maxWidth: 380, marginBottom: 40 }}>
                {strings.posterSub}
              </p>

              {/* Mini status preview */}
              <div style={{
                background: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: 14,
                padding: "16px 18px",
                boxShadow: "0 1px 2px oklch(0.30 0.05 270 / 0.06), 0 4px 12px oklch(0.30 0.05 270 / 0.05)",
                maxWidth: 460,
              }}>
                <div className="font-mono-pt" style={{
                  display: "flex", alignItems: "center", gap: 8,
                  marginBottom: 12, fontSize: 11,
                  color: "var(--color-muted-foreground)",
                  textTransform: "uppercase", letterSpacing: "0.06em",
                }}>
                  <span>{strings.glassHead}</span>
                  <span style={{ flex: 1 }} />
                  <span>14 / 24 shipped</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  <PosterStat label={isRtl ? "لم تبدأ" : "Not started"} value="4" color="var(--color-status-notstarted)" />
                  <PosterStat label={isRtl ? "قيد العمل" : "Working"} value="4" color="var(--color-status-working)" />
                  <PosterStat label={isRtl ? "متوقفة" : "Stuck"} value="2" color="var(--color-status-stuck)" />
                  <PosterStat label={isRtl ? "مكتملة" : "Done"} value="14" color="var(--color-status-done)" />
                </div>
              </div>

              {/* Credo */}
              <p className="font-serif-pt" style={{ marginTop: 32, fontSize: 18, color: "var(--color-muted-foreground)", lineHeight: 1.4, maxWidth: 380 }}>
                {strings.credo}
              </p>
            </div>

            <PosterDeco />
          </section>

          {/* Right pane — form */}
          <section style={{
            flexBasis: 480, flexShrink: 0,
            padding: "48px 56px",
            display: "flex", flexDirection: "column", justifyContent: "center",
            background: "var(--color-background)",
          }}
            className="flex-1 md:flex-none px-6 md:px-14"
          >
            {/* Brand lockup */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
              <BrandMark size={32} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 22, letterSpacing: "-0.01em", lineHeight: 1 }}>past-task</div>
                <div className="font-mono-pt" style={{ fontSize: 10, color: "var(--color-muted-foreground)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 6 }}>
                  {strings.appTag}
                </div>
              </div>
            </div>

            {/* Bootstrap badge */}
            {isBootstrap && (
              <span className="font-mono-pt" style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em",
                padding: "4px 10px",
                background: "oklch(0.94 0.03 280)",
                color: "var(--color-primary)",
                borderRadius: 99, marginBottom: 16, alignSelf: "flex-start",
              }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: "currentColor", display: "inline-block" }} />
                {strings.bootstrapBadge}
              </span>
            )}

            {/* Welcome heading */}
            <h2 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.15, marginBottom: 8 }}>
              {isBootstrap ? strings.welcomeFirst : strings.welcomeBack}{" "}
              <span className="font-serif-pt" style={{ color: "var(--color-primary)" }}>past-task.</span>
            </h2>
            <p style={{ fontSize: 14, color: "var(--color-muted-foreground)", marginBottom: 32, lineHeight: 1.5 }}>
              {isBootstrap ? strings.bootstrapSub : strings.loginSub}
            </p>

            {/* Form */}
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Error banner */}
              {errorMsg && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 12, color: "var(--color-status-stuck)",
                  padding: "8px 10px",
                  background: "oklch(0.97 0.025 25)",
                  border: "1px solid oklch(0.92 0.05 25)",
                  borderRadius: 6,
                }}>
                  <AlertIcon />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Full name (bootstrap only) */}
              {isBootstrap && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: "var(--color-muted-foreground)", letterSpacing: "0.005em" }}>
                    {strings.fullNameLabel}
                  </label>
                  <div className="pt-input-wrap">
                    <input
                      className="pt-input"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Layla Haddad"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Username */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: "var(--color-muted-foreground)", letterSpacing: "0.005em" }}>
                  {strings.usernameLabel}
                </label>
                <div className={`pt-input-wrap${errorMsg ? " error" : ""}`}>
                  <input
                    className="pt-input font-mono-pt"
                    dir="ltr"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setErrorMsg(null); }}
                    placeholder="layla"
                    required
                    minLength={3}
                  />
                </div>
                <div style={{ fontSize: 11, color: "var(--color-muted-foreground)", display: "flex", alignItems: "center", gap: 4 }}>
                  <span>{strings.usernameHelper}</span>
                  {username && (
                    <span className="font-mono-pt" style={{ color: "var(--color-foreground)", opacity: 0.6, marginInlineStart: 4, fontSize: 10 }}>
                      → {emailPreview}
                    </span>
                  )}
                </div>
              </div>

              {/* Password */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: "var(--color-muted-foreground)", letterSpacing: "0.005em" }}>
                  {strings.passwordLabel}
                </label>
                <div className={`pt-input-wrap${errorMsg ? " error" : ""}`}>
                  <input
                    className="pt-input"
                    dir="ltr"
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setErrorMsg(null); }}
                    required
                    minLength={8}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="pt-eye-btn"
                    onClick={() => setShowPw((p) => !p)}
                    aria-label={showPw ? strings.hide : strings.show}
                  >
                    <EyeIcon closed={showPw} />
                  </button>
                </div>
                {!errorMsg && (
                  <div style={{ fontSize: 11, color: "var(--color-muted-foreground)" }}>
                    {strings.passwordHelper}
                  </div>
                )}
              </div>

              {/* Submit */}
              <button className="pt-submit" type="submit" disabled={busy}>
                {busy ? (
                  <><Spinner /><span>{strings.pleaseWait}</span></>
                ) : (
                  <><span>{isBootstrap ? strings.createAdmin : strings.signIn}</span><ArrowRightIcon /></>
                )}
              </button>

              {!isBootstrap && (
                <p style={{ fontSize: 11.5, color: "var(--color-muted-foreground)", textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
                  {strings.noSignup}
                </p>
              )}
            </form>
          </section>
        </div>

        {/* ── Footer ── */}
        <footer className="font-mono-pt" style={{
          padding: "18px 28px 22px",
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          fontSize: 11, color: "var(--color-muted-foreground)",
          flexShrink: 0, borderTop: "1px solid var(--color-border)",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--color-status-done)", display: "inline-block" }} />
            {strings.footerStatus}
          </span>
          <span>·</span>
          <a href="#" style={{ color: "var(--color-muted-foreground)", textDecoration: "none" }}>{strings.footerHelp}</a>
          <span>·</span>
          <a href="#" style={{ color: "var(--color-muted-foreground)", textDecoration: "none" }}>{strings.footerPrivacy}</a>
          <div style={{ flex: 1 }} />
          <span>{strings.footerVer}</span>
        </footer>
      </div>
    </>
  );
}
