import { apiError } from "@/lib/http";
import { isAdminEmail, mutateDb, normalizeEmail, parseEmailList, readDb } from "@/lib/db";

function ensureAdmin(user: { email: string; isAdmin?: boolean; role?: string }) {
  if (!user.isAdmin && user.role !== "admin" && !isAdminEmail(user.email)) {
    throw apiError("Admin access is required.", 403);
  }
}

export async function getWhitelist(user: { email: string; isAdmin?: boolean; role?: string }) {
  ensureAdmin(user);
  const db = await readDb();
  return {
    emails: db.whitelistEmails,
  };
}

export async function saveWhitelist(payload: Record<string, unknown>, user: { email: string; isAdmin?: boolean; role?: string }) {
  ensureAdmin(user);
  const existing = (await readDb()).whitelistEmails;
  const submitted = Array.isArray(payload.emails)
    ? payload.emails.map(normalizeEmail)
    : parseEmailList(payload.emails);
  const emails = Array.from(new Set([...existing, ...submitted].filter((email) => email.includes("@")))).sort();
  if (emails.length === 0) {
    throw apiError("Add at least one valid email.");
  }

  return mutateDb((db) => {
    db.whitelistEmails = emails;
    return { emails: db.whitelistEmails };
  });
}
