import { LoginForm } from "./LoginForm.tsx";
import { safeNext } from "@/lib/auth/next-path.ts";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in · Kickio Content Engine" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Sanitised again in the action on the way back out. This is only what goes
  // into the form.
  const target = safeNext(next);

  return (
    <div className="login-wrap">
      <header className="login-head">
        <h1>Kickio Content Engine</h1>
        <p>Drafts, recipes and everything behind them.</p>
      </header>
      <LoginForm next={target} />
    </div>
  );
}
