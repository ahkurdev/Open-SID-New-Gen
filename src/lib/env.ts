export const env = {
  authSecret: process.env.AUTH_SECRET || "dev-only-insecure-secret-change-me",
  sessionCookie: "vos_session",
  sessionTtlDays: 7,
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgresql://villageos_app:villageos_app_dev@127.0.0.1:54329/village_os",
  maxLoginAttempts: 5,
  lockoutMinutes: 15,
};
