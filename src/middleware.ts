import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_LIFE_MS, readSession, shouldRenew, signSession } from "@/lib/auth/session.ts";

/**
 * Everything is behind the login except the things that cannot use it.
 *
 * An allowlist of open paths rather than a list of protected ones, for the
 * reason every other allowlist here exists: a new page added next month is
 * protected by default, and forgetting to add it to a list cannot expose it.
 *
 * The two trigger endpoints are open here because they carry their own bearer
 * check (`checkTriggerAuth`) and are called by Vercel's scheduler, which has no
 * cookie. They are not unprotected, they are protected differently.
 */
const OPEN = ["/login", "/api/cron", "/api/run"];

export const config = {
  // Everything except Next's own assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (OPEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    // Fail closed and say why. A missing secret must not mean "let everyone
    // in", and it must not look like a wrong password either.
    return new NextResponse(
      "SESSION_SECRET is not set on this deployment, so nobody can sign in. " +
        "Set it in the environment and redeploy.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value, secret);
  if (!session) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    // Where they were going, so the login can send them back there.
    if (pathname !== "/") login.searchParams.set("next", pathname + request.nextUrl.search);
    const response = NextResponse.redirect(login);
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  const response = NextResponse.next();
  // Sliding expiry: a session in use does not end mid-afternoon, and one left
  // alone still dies on its own.
  if (shouldRenew(session)) {
    response.cookies.set(SESSION_COOKIE, await signSession(session.email, secret), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_LIFE_MS / 1000,
    });
  }
  return response;
}
