import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { apiError, normalizeString } from "@/lib/http";
import { isAdminEmail, mutateDb, normalizeEmail, nowIso, publicUser, readDb, type FlashReelsUser } from "@/lib/db";

const COOKIE_NAME = "flashreels_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_ITERATIONS = 120000;

function getAuthSecret() {
  return (
    process.env.FLASHREELS_AUTH_SECRET ||
    process.env.FLASHREELS_SECRET ||
    "flashreels-local-dev-auth-secret"
  );
}

function sign(value: string) {
  return crypto.createHmac("sha256", getAuthSecret()).update(value).digest("base64url");
}

function parseCookies(header: string | null) {
  const result = new Map<string, string>();
  if (!header) {
    return result;
  }
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name) {
      result.set(name, decodeURIComponent(rest.join("=")));
    }
  }
  return result;
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString("base64url")) {
  const hash = crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 32, "sha256").toString("base64url");
  return { hash, salt, iterations: PASSWORD_ITERATIONS };
}

function verifyPassword(password: string, user: FlashReelsUser) {
  const hash = crypto.pbkdf2Sync(
    password,
    user.passwordSalt,
    user.passwordIterations,
    32,
    "sha256",
  ).toString("base64url");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(user.passwordHash));
}

export async function registerUser(payload: Record<string, unknown>) {
  const email = normalizeEmail(payload.email);
  const password = normalizeString(payload.password);
  const displayName = normalizeString(payload.displayName) || email.split("@")[0] || "FlashReels User";

  if (!email || !email.includes("@")) {
    throw apiError("A valid email is required.");
  }
  if (password.length < 8) {
    throw apiError("Password must be at least 8 characters.");
  }

  return mutateDb(async (db) => {
    const whitelist = new Set(db.whitelistEmails.map(normalizeEmail));
    if (!whitelist.has(email)) {
      throw apiError("This email is not whitelisted for FlashReels registration.", 403);
    }

    if (db.users.some((user) => user.email === email)) {
      throw apiError("A user with this email already exists.", 409);
    }

    const role = db.users.length === 0 || isAdminEmail(email) ? "admin" : "user";
    const passwordData = hashPassword(password);
    const createdAt = nowIso();
    const user: FlashReelsUser = {
      id: crypto.randomUUID(),
      email,
      displayName,
      role,
      passwordHash: passwordData.hash,
      passwordSalt: passwordData.salt,
      passwordIterations: passwordData.iterations,
      createdAt,
      updatedAt: createdAt,
    };
    db.users.push(user);
    return publicUser(user);
  });
}

export async function loginUser(payload: Record<string, unknown>) {
  const email = normalizeEmail(payload.email);
  const password = normalizeString(payload.password);
  const db = await readDb();
  const user = db.users.find((candidate) => candidate.email === email);
  if (!user || !password || !verifyPassword(password, user)) {
    throw apiError("Invalid email or password.", 401);
  }
  return publicUser(user);
}

export function setSessionCookie(response: NextResponse, userId: string) {
  const payload = Buffer.from(JSON.stringify({
    userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  })).toString("base64url");
  response.cookies.set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getSessionUser(request: Request) {
  const cookie = parseCookies(request.headers.get("cookie")).get(COOKIE_NAME);
  if (!cookie) {
    return null;
  }

  const [payload, signature] = cookie.split(".");
  if (!payload || !signature || sign(payload) !== signature) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId?: string;
      exp?: number;
    };
    if (!session.userId || !session.exp || session.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    const db = await readDb();
    const user = db.users.find((candidate) => candidate.id === session.userId);
    return user ? publicUser(user) : null;
  } catch {
    return null;
  }
}

export async function requireSessionUser(request: Request) {
  const user = await getSessionUser(request);
  if (!user) {
    throw apiError("Authentication is required.", 401);
  }
  return user;
}
