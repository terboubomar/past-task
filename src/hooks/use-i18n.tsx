import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "ar" | "en";

const DICT = {
  en: {
    app_tagline: "Team workflows",
    nav_dashboard: "Dashboard",
    nav_tasks: "Tasks",
    nav_users: "Users",
    nav_departments: "Departments",
    sign_out: "Sign out",
    language: "Language",
    // Dashboard
    dashboard: "Dashboard",
    dashboard_sub_admin: "Team-wide task progress at a glance.",
    dashboard_sub_member: "Your work and team status.",
    my_tasks: "My tasks",
    no_tasks_assigned: "No tasks assigned to you.",
    no_department: "No department",
    // Tasks
    tasks: "Tasks",
    tasks_sub: "Track every task across teams.",
    new_task: "New task",
    create_task: "Create task",
    creating: "Creating…",
    empty: "Empty",
    unassigned: "Unassigned",
    title: "Title",
    description: "Description",
    priority: "Priority",
    department: "Department",
    assignee: "Assignee",
    start_date: "Start date",
    due_date: "Due date",
    start: "Start",
    due: "Due",
    status: "Status",
    updates: "Updates",
    no_updates: "No updates yet.",
    post_update: "Post an update…",
    post: "Post",
    delete_task: "Delete task",
    task_created: "Task created",
    task_deleted: "Task deleted",
    // Departments
    departments: "Departments",
    departments_sub: "Organize teams that own tasks.",
    new_department: "New department",
    name: "Name",
    create: "Create",
    department_created: "Department created",
    no_departments: "No departments yet.",
    // Users
    users: "Users",
    users_sub: "Create team members and assign them to departments.",
    new_user: "New user",
    create_user: "Create user",
    full_name: "Full name",
    username: "Username",
    temp_password: "Temporary password",
    role: "Role",
    member: "Member",
    admin: "Admin",
    ceo: "CEO",
    user_created: "User created",
    user_deleted: "User deleted",
    no_users: "No users yet.",
    // Login
    login_sub: "Sign in to your account",
    bootstrap_sub: "Create the CEO account to get started",
    password: "Password",
    sign_in: "Sign in",
    create_ceo: "Create CEO account",
    ceo_created: "CEO account created",
    please_wait: "Please wait…",
    no_signup_note: "No public signup. Ask your admin to create your account.",
    // Status & priority
    not_started: "Not started",
    working: "Working on it",
    stuck: "Stuck",
    done: "Done",
    low: "Low",
    medium: "Medium",
    high: "High",
    critical: "Critical",
  },
  ar: {
    app_tagline: "سير عمل الفريق",
    nav_dashboard: "لوحة التحكم",
    nav_tasks: "المهام",
    nav_users: "المستخدمون",
    nav_departments: "الأقسام",
    sign_out: "تسجيل الخروج",
    language: "اللغة",
    dashboard: "لوحة التحكم",
    dashboard_sub_admin: "تقدم مهام الفريق في لمحة.",
    dashboard_sub_member: "أعمالك وحالة الفريق.",
    my_tasks: "مهامي",
    no_tasks_assigned: "لا توجد مهام مسندة إليك.",
    no_department: "بدون قسم",
    tasks: "المهام",
    tasks_sub: "تتبع كل مهمة عبر الفرق.",
    new_task: "مهمة جديدة",
    create_task: "إنشاء مهمة",
    creating: "جاري الإنشاء…",
    empty: "فارغ",
    unassigned: "غير مسند",
    title: "العنوان",
    description: "الوصف",
    priority: "الأولوية",
    department: "القسم",
    assignee: "المسند إليه",
    start_date: "تاريخ البدء",
    due_date: "تاريخ الاستحقاق",
    start: "البدء",
    due: "الاستحقاق",
    status: "الحالة",
    updates: "التحديثات",
    no_updates: "لا توجد تحديثات بعد.",
    post_update: "أضف تحديثاً…",
    post: "نشر",
    delete_task: "حذف المهمة",
    task_created: "تم إنشاء المهمة",
    task_deleted: "تم حذف المهمة",
    departments: "الأقسام",
    departments_sub: "نظّم الفرق المسؤولة عن المهام.",
    new_department: "قسم جديد",
    name: "الاسم",
    create: "إنشاء",
    department_created: "تم إنشاء القسم",
    no_departments: "لا توجد أقسام بعد.",
    users: "المستخدمون",
    users_sub: "أنشئ أعضاء الفريق وعيّنهم للأقسام.",
    new_user: "مستخدم جديد",
    create_user: "إنشاء مستخدم",
    full_name: "الاسم الكامل",
    username: "اسم المستخدم",
    temp_password: "كلمة مرور مؤقتة",
    role: "الدور",
    member: "عضو",
    admin: "مشرف",
    ceo: "المدير التنفيذي",
    user_created: "تم إنشاء المستخدم",
    user_deleted: "تم حذف المستخدم",
    no_users: "لا يوجد مستخدمون بعد.",
    login_sub: "سجّل الدخول إلى حسابك",
    bootstrap_sub: "أنشئ حساب المدير التنفيذي للبدء",
    password: "كلمة المرور",
    sign_in: "تسجيل الدخول",
    create_ceo: "إنشاء حساب المدير التنفيذي",
    ceo_created: "تم إنشاء حساب المدير التنفيذي",
    please_wait: "يرجى الانتظار…",
    no_signup_note: "لا يوجد تسجيل عام. اطلب من المشرف إنشاء حسابك.",
    not_started: "لم تبدأ",
    working: "قيد العمل",
    stuck: "متعثرة",
    done: "منجزة",
    low: "منخفضة",
    medium: "متوسطة",
    high: "عالية",
    critical: "حرجة",
  },
} as const;

export type DictKey = keyof typeof DICT["en"];

type Ctx = {
  lang: Lang;
  dir: "rtl" | "ltr";
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (k: DictKey) => string;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === "undefined") return "ar";
    return (localStorage.getItem("lang") as Lang) || "ar";
  });
  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
      document.documentElement.dir = dir;
    }
  }, [lang, dir]);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem("lang", l);
  };

  const t = (k: DictKey) => DICT[lang][k] ?? DICT.en[k] ?? k;

  return (
    <I18nContext.Provider value={{ lang, dir, setLang, toggle: () => setLang(lang === "ar" ? "en" : "ar"), t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be inside I18nProvider");
  return ctx;
}
