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
    creating: "Creating\u2026",
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
    post_update: "Post an update\u2026",
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
    edit_user: "Edit User",
    full_name: "Full name",
    username: "Username",
    temp_password: "Temporary password",
    role: "Role",
    member: "Member",
    admin: "Admin",
    ceo: "CEO",
    super_admin: "Super Admin",
    user_created: "User created",
    user_updated: "User updated",
    user_deleted: "User deleted",
    no_users: "No users yet.",
    new_password_optional: "New Password (optional)",
    leave_blank_to_keep: "Leave blank to keep current",
    save_changes: "Save Changes",
    saving: "Saving\u2026",
    // Login
    login_sub: "Sign in to your account",
    bootstrap_sub: "Create the CEO account to get started",
    password: "Password",
    sign_in: "Sign in",
    create_ceo: "Create CEO account",
    ceo_created: "CEO account created",
    please_wait: "Please wait\u2026",
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
    app_tagline: "\u0633\u064a\u0631 \u0639\u0645\u0644 \u0627\u0644\u0641\u0631\u064a\u0642",
    nav_dashboard: "\u0644\u0648\u062d\u0629 \u0627\u0644\u062a\u062d\u0643\u0645",
    nav_tasks: "\u0627\u0644\u0645\u0647\u0627\u0645",
    nav_users: "\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u0648\u0646",
    nav_departments: "\u0627\u0644\u0623\u0642\u0633\u0627\u0645",
    sign_out: "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c",
    language: "\u0627\u0644\u0644\u063a\u0629",
    dashboard: "\u0644\u0648\u062d\u0629 \u0627\u0644\u062a\u062d\u0643\u0645",
    dashboard_sub_admin: "\u062a\u0642\u062f\u0645 \u0645\u0647\u0627\u0645 \u0627\u0644\u0641\u0631\u064a\u0642 \u0641\u064a \u0644\u0645\u062d\u0629.",
    dashboard_sub_member: "\u0623\u0639\u0645\u0627\u0644\u0643 \u0648\u062d\u0627\u0644\u0629 \u0627\u0644\u0641\u0631\u064a\u0642.",
    my_tasks: "\u0645\u0647\u0627\u0645\u064a",
    no_tasks_assigned: "\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0647\u0627\u0645 \u0645\u0633\u0646\u062f\u0629 \u0625\u0644\u064a\u0643.",
    no_department: "\u0628\u062f\u0648\u0646 \u0642\u0633\u0645",
    tasks: "\u0627\u0644\u0645\u0647\u0627\u0645",
    tasks_sub: "\u062a\u062a\u0628\u0639 \u0643\u0644 \u0645\u0647\u0645\u0629 \u0639\u0628\u0631 \u0627\u0644\u0641\u0631\u0642.",
    new_task: "\u0645\u0647\u0645\u0629 \u062c\u062f\u064a\u062f\u0629",
    create_task: "\u0625\u0646\u0634\u0627\u0621 \u0645\u0647\u0645\u0629",
    creating: "\u062c\u0627\u0631\u064a \u0627\u0644\u0625\u0646\u0634\u0627\u0621\u2026",
    empty: "\u0641\u0627\u0631\u063a",
    unassigned: "\u063a\u064a\u0631 \u0645\u0633\u0646\u062f",
    title: "\u0627\u0644\u0639\u0646\u0648\u0627\u0646",
    description: "\u0627\u0644\u0648\u0635\u0641",
    priority: "\u0627\u0644\u0623\u0648\u0644\u0648\u064a\u0629",
    department: "\u0627\u0644\u0642\u0633\u0645",
    assignee: "\u0627\u0644\u0645\u0633\u0646\u062f \u0625\u0644\u064a\u0647",
    start_date: "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0628\u062f\u0621",
    due_date: "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0627\u0633\u062a\u062d\u0642\u0627\u0642",
    start: "\u0627\u0644\u0628\u062f\u0621",
    due: "\u0627\u0644\u0627\u0633\u062a\u062d\u0642\u0627\u0642",
    status: "\u0627\u0644\u062d\u0627\u0644\u0629",
    updates: "\u0627\u0644\u062a\u062d\u062f\u064a\u062b\u0627\u062a",
    no_updates: "\u0644\u0627 \u062a\u0648\u062c\u062f \u062a\u062d\u062f\u064a\u062b\u0627\u062a \u0628\u0639\u062f.",
    post_update: "\u0623\u0636\u0641 \u062a\u062d\u062f\u064a\u062b\u0627\u064b\u2026",
    post: "\u0646\u0634\u0631",
    delete_task: "\u062d\u0630\u0641 \u0627\u0644\u0645\u0647\u0645\u0629",
    task_created: "\u062a\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0645\u0647\u0645\u0629",
    task_deleted: "\u062a\u0645 \u062d\u0630\u0641 \u0627\u0644\u0645\u0647\u0645\u0629",
    departments: "\u0627\u0644\u0623\u0642\u0633\u0627\u0645",
    departments_sub: "\u0646\u0638\u0651\u0645 \u0627\u0644\u0641\u0631\u0642 \u0627\u0644\u0645\u0633\u0624\u0648\u0644\u0629 \u0639\u0646 \u0627\u0644\u0645\u0647\u0627\u0645.",
    new_department: "\u0642\u0633\u0645 \u062c\u062f\u064a\u062f",
    name: "\u0627\u0644\u0627\u0633\u0645",
    create: "\u0625\u0646\u0634\u0627\u0621",
    department_created: "\u062a\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0642\u0633\u0645",
    no_departments: "\u0644\u0627 \u062a\u0648\u062c\u062f \u0623\u0642\u0633\u0627\u0645 \u0628\u0639\u062f.",
    users: "\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u0648\u0646",
    users_sub: "\u0623\u0646\u0634\u0626 \u0623\u0639\u0636\u0627\u0621 \u0627\u0644\u0641\u0631\u064a\u0642 \u0648\u0639\u064a\u0651\u0646\u0647\u0645 \u0644\u0644\u0623\u0642\u0633\u0627\u0645.",
    new_user: "\u0645\u0633\u062a\u062e\u062f\u0645 \u062c\u062f\u064a\u062f",
    create_user: "\u0625\u0646\u0634\u0627\u0621 \u0645\u0633\u062a\u062e\u062f\u0645",
    edit_user: "\u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645",
    full_name: "\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644",
    username: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645",
    temp_password: "\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0645\u0624\u0642\u062a\u0629",
    role: "\u0627\u0644\u062f\u0648\u0631",
    member: "\u0639\u0636\u0648",
    admin: "\u0645\u0634\u0631\u0641",
    ceo: "\u0627\u0644\u0645\u062f\u064a\u0631 \u0627\u0644\u062a\u0646\u0641\u064a\u0630\u064a",
    super_admin: "\u0645\u062f\u064a\u0631 \u0639\u0627\u0645",
    user_created: "\u062a\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645",
    user_updated: "\u062a\u0645 \u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645",
    user_deleted: "\u062a\u0645 \u062d\u0630\u0641 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645",
    no_users: "\u0644\u0627 \u064a\u0648\u062c\u062f \u0645\u0633\u062a\u062e\u062f\u0645\u0648\u0646 \u0628\u0639\u062f.",
    new_password_optional: "\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u062c\u062f\u064a\u062f\u0629 (\u0627\u062e\u062a\u064a\u0627\u0631\u064a)",
    leave_blank_to_keep: "\u0627\u062a\u0631\u0643\u0647 \u0641\u0627\u0631\u063a\u064b\u0627 \u0644\u0644\u0625\u0628\u0642\u0627\u0621 \u0639\u0644\u0649 \u0627\u0644\u062d\u0627\u0644\u064a",
    save_changes: "\u062d\u0641\u0638 \u0627\u0644\u062a\u063a\u064a\u064a\u0631\u0627\u062a",
    saving: "\u062c\u0627\u0631\u064d \u0627\u0644\u062d\u0641\u0638\u2026",
    login_sub: "\u0633\u062c\u0651\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0625\u0644\u0649 \u062d\u0633\u0627\u0628\u0643",
    bootstrap_sub: "\u0623\u0646\u0634\u0626 \u062d\u0633\u0627\u0628 \u0627\u0644\u0645\u062f\u064a\u0631 \u0627\u0644\u062a\u0646\u0641\u064a\u0630\u064a \u0644\u0644\u0628\u062f\u0621",
    password: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631",
    sign_in: "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644",
    create_ceo: "\u0625\u0646\u0634\u0627\u0621 \u062d\u0633\u0627\u0628 \u0627\u0644\u0645\u062f\u064a\u0631 \u0627\u0644\u062a\u0646\u0641\u064a\u0630\u064a",
    ceo_created: "\u062a\u0645 \u0625\u0646\u0634\u0627\u0621 \u062d\u0633\u0627\u0628 \u0627\u0644\u0645\u062f\u064a\u0631 \u0627\u0644\u062a\u0646\u0641\u064a\u0630\u064a",
    please_wait: "\u064a\u0631\u062c\u0649 \u0627\u0644\u0627\u0646\u062a\u0638\u0627\u0631\u2026",
    no_signup_note: "\u0644\u0627 \u064a\u0648\u062c\u062f \u062a\u0633\u062c\u064a\u0644 \u0639\u0627\u0645. \u0627\u0637\u0644\u0628 \u0645\u0646 \u0627\u0644\u0645\u0634\u0631\u0641 \u0625\u0646\u0634\u0627\u0621 \u062d\u0633\u0627\u0628\u0643.",
    not_started: "\u0644\u0645 \u062a\u0628\u062f\u0623",
    working: "\u0642\u064a\u062f \u0627\u0644\u0639\u0645\u0644",
    stuck: "\u0645\u062a\u0639\u062b\u0631\u0629",
    done: "\u0645\u0646\u062c\u0632\u0629",
    low: "\u0645\u0646\u062e\u0641\u0636\u0629",
    medium: "\u0645\u062a\u0648\u0633\u0637\u0629",
    high: "\u0639\u0627\u0644\u064a\u0629",
    critical: "\u062d\u0631\u062c\u0629",
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
