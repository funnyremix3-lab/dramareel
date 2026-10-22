"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { Callout } from "@/components/ui/layout";
import { errorMessage } from "@/lib/api";
import { DEV_ACCOUNTS, useAuth, type DevAccount } from "@/lib/auth";
import { env, supabaseConfigured } from "@/lib/env";

/** Only allow same-site relative paths as the post-login redirect. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/";
}

export function LoginForm() {
  const { status, signInDev, sendOtp, verifyOtp } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (status === "signedIn") router.replace(next);
  }, [status, router, next]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function onEmail(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email address");
      return;
    }
    void run("otp", async () => {
      await sendOtp(email.trim());
      setStep("code");
      setInfo(`We sent a sign-in code to ${email.trim()}.`);
    });
  }

  function onCode(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6,10}$/.test(code.trim())) {
      setError("Enter the numeric code from the email");
      return;
    }
    void run("verify", () => verifyOtp(email.trim(), code.trim()));
  }

  function dev(account: DevAccount) {
    void run(`dev-${account}`, () => signInDev(account));
  }

  return (
    <div className="w-full max-w-sm space-y-6 rounded-lg border border-line bg-surface p-6 shadow-sm">
      <div>
        <h1 className="text-xl font-semibold text-ink">Reel Drama Admin</h1>
        <p className="mt-1 text-sm text-muted">Sign in with your work email.</p>
      </div>

      <FormError message={error} />
      {info && !error && (
        <p role="status" className="text-sm text-green-800">
          {info}
        </p>
      )}

      {supabaseConfigured ? (
        step === "email" ? (
          <form onSubmit={onEmail} className="space-y-4" noValidate>
            <Field label="Email" required>
              <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" className="w-full" loading={busy === "otp"}>
              Email me a code
            </Button>
          </form>
        ) : (
          <form onSubmit={onCode} className="space-y-4" noValidate>
            <Field label="Code" required hint="Check your inbox for the one-time code.">
              <Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" className="w-full" loading={busy === "verify"}>
              Sign in
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setStep("email");
                setCode("");
                setInfo(null);
              }}
            >
              Use a different email
            </Button>
          </form>
        )
      ) : (
        <Callout tone="yellow" title="Email sign-in is not configured">
          Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable email one-time codes.
        </Callout>
      )}

      {env.devLogin && (
        <section aria-labelledby="dev-login" className="space-y-2 border-t border-line pt-4">
          <h2 id="dev-login" className="text-sm font-semibold text-ink">
            Development accounts
          </h2>
          <p className="text-xs text-muted">Uses POST /dev/token, which only exists on non-production APIs.</p>
          <div className="grid grid-cols-1 gap-2">
            {DEV_ACCOUNTS.map((a) => (
              <Button key={a.account} onClick={() => dev(a.account)} loading={busy === `dev-${a.account}`} disabled={busy !== null && busy !== `dev-${a.account}`}>
                {a.label}
              </Button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
