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

/* ── Inlined styles (design-token-aware, no Tailwind needed here) ──────────── */
const CSS = `
  @keyframes pt-spin    { to { transform: rotate(360deg); } }
  @keyframes pt-pulse2  { 0%,100%{opacity:1} 50%{opacity:.3} }

  /* Input wrapper */
  .pt-iw {
    display:flex; align-items:stretch;
    background:var(--color-card);
    border:1px solid var(--color-border);
    border-radius:8px;
    transition:border-color .12s,box-shadow .12s;
    overflow:hidden;
  }
  .pt-iw:focus-within {
    border-color:var(--color-primary);
    box-shadow:0 0 0 3px oklch(0.94 0.03 280);
  }
  .pt-iw.err {
    border-color:var(--color-status-stuck);
    box-shadow:0 0 0 3px oklch(0.95 0.04 25);
  }
  .pt-inp {
    flex:1; min-width:0; height:42px; padding:0 14px;
    font-size:14px; font-family:inherit;
    color:var(--color-foreground);
    background:transparent; border:none; outline:none;
  }
  .pt-inp::placeholder { color:var(--color-muted-foreground); }
  .pt-eye {
    padding:0 12px; display:inline-flex; align-items:center;
    color:var(--color-muted-foreground);
    border-inline-start:1px solid var(--color-border);
    background:var(--color-muted);
    cursor:pointer; transition:color .1s; border-radius:0;
    border:none; outline:none; font-family:inherit;
  }
  .pt-eye:hover { color:var(--color-foreground); }

  /* Submit button */
  .pt-sub {
    height:44px; border-radius:8px;
    background:var(--color-primary); color:#fff;
    font-size:14px; font-weight:500; font-family:inherit;
    display:inline-flex; align-items:center; justify-content:center; gap:8px;
    width:100%; border:none; cursor:pointer;
    transition:opacity .12s, transform .06s;
    margin-top:8px;
  }
  .pt-sub:hover  { opacity:.91; }
  .pt-sub:active { transform:translateY(.5px); }
  .pt-sub:disabled { opacity:.65; cursor:not-allowed; }

  /* Lang toggle pill */
  .pt-lt {
    display:inline-flex; align-items:center;
    background:var(--color-muted);
    border:1px solid var(--color-border);
    border-radius:99px; padding:3px; gap:2px;
  }
  .pt-lt-btn {
    padding:5px 12px; font-size:12px; border-radius:99px;
    border:none; cursor:pointer; font-family:inherit;
    transition:all .15s;
  }

  /* Dotted grid background for centered layout */
  .pt-dotgrid {
    background-image:radial-gradient(var(--color-border) 1px, transparent 1px);
    background-size:24px 24px;
  }

  /* Responsive: tablet / large phone */
  @media (max-width: 900px) {
    .pt-poster { display:none !important; }
    .pt-pane-split {
      flex:1 !important; flex-basis:auto !important;
      padding:32px 28px !important;
    }
  }
  @media (max-width: 640px) {
    .pt-topbar { padding:12px 16px !important; gap:8px !important; flex-wrap:wrap; }
    .pt-toptag { display:none !important; }
    .pt-pane-split { padding:24px 18px !important; }
    .pt-pane-centered {
      padding:26px 20px !important;
      border-radius:14px !important;
    }
    .pt-welcome { font-size:22px !important; }
    .pt-welcome-sub { font-size:13px !important; margin-bottom:22px !important; }
    .pt-brand-name { font-size:18px !important; }
    .pt-inp { height:40px !important; }
    .pt-sub { height:42px !important; }
    .pt-foot-label { display:none !important; }
  }
  @media (max-width: 420px) {
    .pt-topbar { padding:10px 12px !important; }
    .pt-pane-centered { padding:20px 16px !important; border-radius:12px !important; }
    .pt-foot-ver { display:none !important; }
    .pt-lt-btn { padding:4px 9px !important; }
  }
`;

/* ── SVG atoms ───────────────────────────────────────────────────────────────── */
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

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.5 2.5 17a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.5a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

function Spinner() {
  return (
    <span style={{
      display: "inline-block", width: 14, height: 14,
      border: "2px solid currentColor", borderRightColor: "transparent",
      borderRadius: "50%", animation: "pt-spin 0.7s linear infinite",
    }} />
  );
}

function PosterDeco() {
  return (
    <svg style={{ position: "absolute", bottom: -60, insetInlineEnd: -60, width: 320, height: 320, opacity: 0.55, pointerEvents: "none" }} viewBox="0 0 320 320" aria-hidden="true">
      <g fill="none" stroke="var(--color-border)" strokeWidth="1.5">
        <rect x="10"  y="10"  width="140" height="140" rx="20" />
        <rect x="170" y="10"  width="140" height="140" rx="20" />
        <rect x="10"  y="170" width="140" height="140" rx="20" />
        <rect x="170" y="170" width="140" height="140" rx="20" />
      </g>
    </svg>
  );
}

function PosterStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6, padding:"10px 12px", background:"var(--color-muted)", borderRadius:8, borderTop:`2px solid ${color}` }}>
      <span className="font-mono-pt" style={{ fontSize:10, color:"var(--color-muted-foreground)", textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</span>
      <span className="font-mono-pt" style={{ fontSize:22, fontWeight:600, letterSpacing:"-0.02em", color, lineHeight:1 }}>{value}</span>
    </div>
  );
}

/* ── i18n ─────────────────────────────────────────────────────────────────── */
type Strings = {
  appTag:string; welcomeBack:string; welcomeFirst:string; loginSub:string;
  bootstrapSub:string; bootstrapBadge:string; fullNameLabel:string;
  usernameLabel:string; passwordLabel:string; usernameHelper:string;
  passwordHelper:string; show:string; hide:string; signIn:string;
  createAdmin:string; pleaseWait:string; noSignup:string; posterEyebrow:string;
  posterTitleA:string; posterTitleB:string; posterSub:string; glassHead:string;
  credo:string; footerStatus:string; footerVer:string; footerHelp:string;
  footerPrivacy:string; nsLabel:string; workLabel:string; stuckLabel:string; doneLabel:string;
};

const STRINGS: Record<"en"|"ar", Strings> = {
  en: {
    appTag:"INTERNAL · TEAM", welcomeBack:"Welcome back to", welcomeFirst:"Let's set up",
    loginSub:"Sign in with your team username and password.",
    bootstrapSub:"No users yet. Create the first admin account to get started.",
    bootstrapBadge:"First-time setup",
    fullNameLabel:"Full name", usernameLabel:"Username", passwordLabel:"Password",
    usernameHelper:"Lowercase, no spaces.", passwordHelper:"At least 8 characters.",
    show:"Show", hide:"Hide", signIn:"Sign in", createAdmin:"Create admin account",
    pleaseWait:"Please wait…", noSignup:"No self sign-up. Ask an admin to add you.",
    posterEyebrow:"Internal team workspace", posterTitleA:"The work", posterTitleB:"continues today.",
    posterSub:"A single source of truth for what's stuck, what's moving, and what just shipped.",
    glassHead:"Live · Week 22", credo:"“Done is a status, not a feeling.”",
    footerStatus:"All systems operational", footerVer:"Past-Task v2 · 2026.05",
    footerHelp:"Need help?", footerPrivacy:"Privacy",
    nsLabel:"Not started", workLabel:"Working", stuckLabel:"Stuck", doneLabel:"Done",
  },
  ar: {
    appTag:"الفريق الداخلي", welcomeBack:"أهلًا بعودتك إلى", welcomeFirst:"لنبدأ بإعداد",
    loginSub:"سجّل الدخول باسم المستخدم وكلمة المرور الخاصين بالفريق.",
    bootstrapSub:"لا يوجد مستخدمون بعد. أنشئ حساب المسؤول الأول للبدء.",
    bootstrapBadge:"إعداد لأول مرة",
    fullNameLabel:"الاسم الكامل", usernameLabel:"اسم المستخدم", passwordLabel:"كلمة المرور",
    usernameHelper:"أحرف صغيرة بلا مسافات.", passwordHelper:"٨ أحرف على الأقل.",
    show:"إظهار", hide:"إخفاء", signIn:"تسجيل الدخول", createAdmin:"أنشئ حساب المسؤول",
    pleaseWait:"يرجى الانتظار…", noSignup:"لا يوجد تسجيل ذاتي. اطلب من المسؤول إضافتك.",
    posterEyebrow:"مساحة عمل الفريق الداخلي", posterTitleA:"العمل", posterTitleB:"مستمر اليوم.",
    posterSub:"مصدر واحد للحقيقة لما هو متوقف، وما يتحرّك، وما تم إنجازه للتو.",
    glassHead:"مباشر · الأسبوع ٢٢", credo:"“الإنجاز حالة، لا شعور.”",
    footerStatus:"جميع الأنظمة تعمل", footerVer:"Past-Task v2 · 2026.05",
    footerHelp:"تحتاج مساعدة؟", footerPrivacy:"الخصوصية",
    nsLabel:"لم تبدأ", workLabel:"قيد العمل", stuckLabel:"متوقفة", doneLabel:"مكتملة",
  },
} as const;

/* ── Form pane (shared between centered + split) ──────────────────────────── */
function FormPane({
  s, isBootstrap, busy, errorMsg, username, password, fullName, showPw,
  onUsernameChange, onPasswordChange, onFullNameChange, onShowPw, onSubmit,
  paneClass, paneStyle,
}: {
  s: Strings; isBootstrap: boolean; busy: boolean;
  errorMsg: string | null; username: string; password: string;
  fullName: string; showPw: boolean;
  onUsernameChange: (v: string) => void; onPasswordChange: (v: string) => void;
  onFullNameChange: (v: string) => void; onShowPw: () => void;
  onSubmit: (e: React.FormEvent) => void;
  paneClass?: string; paneStyle?: React.CSSProperties;
}) {
  const emailPreview = username ? `${username.trim().toLowerCase()}@past-task.local` : "";

  return (
    <section style={paneStyle} className={paneClass}>
      {/* Brand lockup */}
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:28 }}>
        <BrandMark size={32} />
        <div>
          <div className="pt-brand-name" style={{ fontWeight:600, fontSize:22, letterSpacing:"-0.01em", lineHeight:1 }}>past-task</div>
          <div className="font-mono-pt" style={{ fontSize:10, color:"var(--color-muted-foreground)", textTransform:"uppercase", letterSpacing:"0.1em", marginTop:6 }}>{s.appTag}</div>
        </div>
      </div>

      {/* Bootstrap badge */}
      {isBootstrap && (
        <span className="font-mono-pt" style={{
          display:"inline-flex", alignItems:"center", gap:6,
          fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em",
          padding:"4px 10px", background:"oklch(0.94 0.03 280)",
          color:"var(--color-primary)", borderRadius:99, marginBottom:16, alignSelf:"flex-start",
        }}>
          <span style={{ width:6, height:6, borderRadius:99, background:"currentColor", display:"inline-block" }} />
          {s.bootstrapBadge}
        </span>
      )}

      {/* Welcome heading */}
      <h2 className="pt-welcome" style={{ fontSize:28, fontWeight:600, letterSpacing:"-0.02em", lineHeight:1.15, marginBottom:8 }}>
        {isBootstrap ? s.welcomeFirst : s.welcomeBack}{" "}
        <span className="font-serif-pt" style={{ color:"var(--color-primary)" }}>past-task.</span>
      </h2>
      <p className="pt-welcome-sub" style={{ fontSize:14, color:"var(--color-muted-foreground)", marginBottom:32, lineHeight:1.5 }}>
        {isBootstrap ? s.bootstrapSub : s.loginSub}
      </p>

      {/* Form */}
      <form onSubmit={onSubmit} style={{ display:"flex", flexDirection:"column", gap:16 }}>

        {/* Error */}
        {errorMsg && (
          <div style={{
            display:"flex", alignItems:"center", gap:8, fontSize:12,
            color:"var(--color-status-stuck)", padding:"8px 10px",
            background:"oklch(0.97 0.025 25)", border:"1px solid oklch(0.92 0.05 25)", borderRadius:6,
          }}>
            <AlertIcon /><span>{errorMsg}</span>
          </div>
        )}

        {/* Full name (bootstrap) */}
        {isBootstrap && (
          <Field label={s.fullNameLabel}>
            <div className="pt-iw">
              <input className="pt-inp" value={fullName} onChange={(e) => onFullNameChange(e.target.value)} placeholder="Layla Haddad" required />
            </div>
          </Field>
        )}

        {/* Username */}
        <Field label={s.usernameLabel} helper={
          <span style={{ display:"flex", alignItems:"center", gap:4 }}>
            {s.usernameHelper}
            {emailPreview && (
              <span className="font-mono-pt" style={{ opacity:.55, fontSize:10, marginInlineStart:4 }}>→ {emailPreview}</span>
            )}
          </span>
        }>
          <div className={`pt-iw${errorMsg ? " err" : ""}`}>
            <input
              className="pt-inp font-mono-pt" dir="ltr"
              autoCapitalize="none" autoCorrect="off"
              value={username} onChange={(e) => onUsernameChange(e.target.value)}
              placeholder="layla" required minLength={3}
            />
          </div>
        </Field>

        {/* Password */}
        <Field label={s.passwordLabel} helper={!errorMsg ? <span>{s.passwordHelper}</span> : undefined}>
          <div className={`pt-iw${errorMsg ? " err" : ""}`}>
            <input
              className="pt-inp" dir="ltr"
              type={showPw ? "text" : "password"}
              value={password} onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="••••••••" required minLength={8}
            />
            <button type="button" className="pt-eye" onClick={onShowPw} aria-label={showPw ? s.hide : s.show}>
              <EyeIcon closed={showPw} />
            </button>
          </div>
        </Field>

        {/* Submit */}
        <button className="pt-sub" type="submit" disabled={busy}>
          {busy
            ? <><Spinner /><span>{s.pleaseWait}</span></>
            : <><span>{isBootstrap ? s.createAdmin : s.signIn}</span><ArrowRightIcon /></>
          }
        </button>

        {!isBootstrap && (
          <p style={{ fontSize:11.5, color:"var(--color-muted-foreground)", textAlign:"center", marginTop:4, lineHeight:1.5 }}>
            {s.noSignup}
          </p>
        )}
      </form>
    </section>
  );
}

function Field({ label, helper, children }: { label: string; helper?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      <label style={{ fontSize:12, fontWeight:500, color:"var(--color-muted-foreground)", letterSpacing:"0.005em" }}>{label}</label>
      {children}
      {helper && <div style={{ fontSize:11, color:"var(--color-muted-foreground)", display:"flex", alignItems:"center", gap:4 }}>{helper}</div>}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────────── */
function LoginPage() {
  const { session, loading } = useAuth();
  const { lang, toggle } = useI18n();
  const nav = useNavigate();
  const checkUsers = useServerFn(hasAnyUsers);
  const bootstrap  = useServerFn(bootstrapCeo);

  const { data: usersCheck } = useQuery({
    queryKey: ["has-any-users"],
    queryFn: () => checkUsers(),
  });

  useEffect(() => { if (!loading && session) nav({ to: "/dashboard" }); }, [loading, session, nav]);

  const [mode, setMode]         = useState<"login" | "bootstrap">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [busy, setBusy]         = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (usersCheck) setMode(usersCheck.hasUsers ? "login" : "bootstrap");
  }, [usersCheck]);

  const isBootstrap = mode === "bootstrap";
  const isRtl       = lang === "ar";
  const s           = STRINGS[isRtl ? "ar" : "en"];
  const toEmail     = (u: string) => `${u.trim().toLowerCase()}@past-task.local`;

  const handleUsernameChange = (v: string) => { setUsername(v); setErrorMsg(null); };
  const handlePasswordChange = (v: string) => { setPassword(v); setErrorMsg(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setBusy(true);
    try {
      if (isBootstrap) {
        await bootstrap({ data: { username: username.trim().toLowerCase(), password, full_name: fullName } });
        const { error } = await supabase.auth.signInWithPassword({ email: toEmail(username), password });
        if (error) throw error;
        toast.success("Admin account created");
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

  const formProps = {
    s, isBootstrap, busy, errorMsg, username, password, fullName, showPw,
    onUsernameChange: handleUsernameChange,
    onPasswordChange: handlePasswordChange,
    onFullNameChange: setFullName,
    onShowPw: () => setShowPw((p) => !p),
    onSubmit: submit,
  };

  /* Shared topbar + footer wrappers */
  const Topbar = () => (
    <div className="pt-topbar" style={{ padding:"18px 28px", display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <BrandMark size={20} />
        <span style={{ fontWeight:600, fontSize:14, letterSpacing:"-0.01em" }}>past-task</span>
      </div>
      <span className="pt-toptag font-mono-pt" style={{ fontSize:10, color:"var(--color-muted-foreground)", textTransform:"uppercase", letterSpacing:"0.1em", padding:"3px 10px", border:"1px solid var(--color-border)", borderRadius:99 }}>
        {s.appTag}
      </span>
      <div style={{ flex:1 }} />
      {/* Language toggle */}
      <div className="pt-lt">
        {(["en","ar"] as const).map((l) => (
          <button key={l} className="pt-lt-btn" onClick={toggle}
            style={{
              background: lang === l ? "var(--color-card)" : "transparent",
              color:      lang === l ? "var(--color-foreground)" : "var(--color-muted-foreground)",
              fontWeight: lang === l ? 500 : 400,
              boxShadow:  lang === l ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
            }}
          >
            {l === "en" ? "EN" : "ع"}
          </button>
        ))}
      </div>
    </div>
  );

  const Footer = () => (
    <footer className="font-mono-pt" style={{
      padding:"16px 28px 20px", display:"flex", alignItems:"center", gap:10,
      flexWrap:"wrap", fontSize:11, color:"var(--color-muted-foreground)",
      flexShrink:0, borderTop:"1px solid var(--color-border)",
    }}>
      <span style={{ display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ width:6, height:6, borderRadius:99, background:"var(--color-status-done)", display:"inline-block" }} />
        <span className="pt-foot-label">{s.footerStatus}</span>
      </span>
      <span>·</span>
      <a href="#" style={{ color:"var(--color-muted-foreground)", textDecoration:"none" }}>{s.footerHelp}</a>
      <span>·</span>
      <a href="#" style={{ color:"var(--color-muted-foreground)", textDecoration:"none" }}>{s.footerPrivacy}</a>
      <div style={{ flex:1 }} />
      <span className="pt-foot-ver">{s.footerVer}</span>
    </footer>
  );

  return (
    <>
      <style>{CSS}</style>
      <div dir={isRtl ? "rtl" : "ltr"} style={{ minHeight:"100vh", display:"flex", flexDirection:"column", background:"var(--color-background)", color:"var(--color-foreground)", fontFamily:"Geist, system-ui, sans-serif", fontSize:14 }}>

        <Topbar />

        {/* ── CENTERED layout (default — works great on all screen sizes) ── */}
        <div className="pt-dotgrid" style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px 16px", minHeight:0 }}>

          {/* Card wraps the form */}
          <div style={{ width:"100%", maxWidth:440, display:"flex", flexDirection:"column" }}>

            {/* On desktop ≥ md: show the poster above as a decorative mini-card */}
            <div
              className="hidden md:block"
              style={{ marginBottom:16, background:"var(--color-card)", border:"1px solid var(--color-border)", borderRadius:14, padding:"18px 20px", boxShadow:"0 1px 2px oklch(0.30 0.05 270/0.06),0 4px 12px oklch(0.30 0.05 270/0.05)", position:"relative", overflow:"hidden" }}
            >
              {/* Eyebrow */}
              <div className="font-mono-pt" style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, fontSize:11, color:"var(--color-muted-foreground)", textTransform:"uppercase", letterSpacing:"0.06em" }}>
                <span style={{ width:6, height:6, borderRadius:99, background:"var(--color-status-working)", animation:"pt-pulse2 2.4s ease-in-out infinite", display:"inline-block" }} />
                {s.posterEyebrow}
              </div>
              {/* Mini heading */}
              <p style={{ fontSize:17, fontWeight:600, letterSpacing:"-0.015em", lineHeight:1.2, marginBottom:14 }}>
                {s.posterTitleA}{" "}
                <span className="font-serif-pt" style={{ color:"var(--color-primary)" }}>{s.posterTitleB}</span>
              </p>
              {/* Status grid */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                <PosterStat label={s.nsLabel}   value="4"  color="var(--color-status-notstarted)" />
                <PosterStat label={s.workLabel} value="4"  color="var(--color-status-working)" />
                <PosterStat label={s.stuckLabel} value="2" color="var(--color-status-stuck)" />
                <PosterStat label={s.doneLabel} value="14" color="var(--color-status-done)" />
              </div>
              {/* Credo */}
              <p className="font-serif-pt" style={{ marginTop:14, fontSize:13, color:"var(--color-muted-foreground)", lineHeight:1.4 }}>{s.credo}</p>
              {/* Decorative deco (clipped inside the card) */}
              <svg style={{ position:"absolute", bottom:-40, insetInlineEnd:-40, width:200, height:200, opacity:0.4, pointerEvents:"none" }} viewBox="0 0 320 320" aria-hidden="true">
                <g fill="none" stroke="var(--color-border)" strokeWidth="1.5">
                  <rect x="10" y="10" width="140" height="140" rx="20" />
                  <rect x="170" y="10" width="140" height="140" rx="20" />
                  <rect x="10" y="170" width="140" height="140" rx="20" />
                  <rect x="170" y="170" width="140" height="140" rx="20" />
                </g>
              </svg>
            </div>

            {/* Form card */}
            <FormPane
              {...formProps}
              paneClass="pt-pane-centered"
              paneStyle={{
                background:"var(--color-card)",
                border:"1px solid var(--color-border)",
                borderRadius:16,
                padding:"36px",
                boxShadow:"0 20px 60px oklch(0.30 0.05 270/0.10),0 4px 16px oklch(0.30 0.05 270/0.05)",
              }}
            />
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}
