"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import {
  loginUserAction,
  resendCodeAction,
  verifyEmailAction,
  type ActionState,
} from "@/app/actions";

const initialState: ActionState = { ok: false };

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [state, formAction, pending] = useActionState(loginUserAction, initialState);
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyEmailAction, initialState);
  const [resendState, resendAction, resendPending] = useActionState(resendCodeAction, initialState);

  if (!state.ok && state.needsEmailVerify) {
    return (
      <div className="space-y-4">
        {state.message && (
          <p className="rounded-lg border border-gold-600/40 bg-maroon-900/40 px-3 py-2 text-sm text-gold-300">
            {state.message}
          </p>
        )}

        <form action={verifyAction} className="space-y-4">
          <input type="hidden" name="email" value={email} />
          <div>
            <label htmlFor="code" className="label">
              Verification code
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
              className="input"
              placeholder="123456"
            />
          </div>

          {verifyState.message && (
            <p className="rounded-lg border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative">
              {verifyState.message}
            </p>
          )}

          <button type="submit" disabled={verifyPending} className="btn-primary w-full">
            {verifyPending ? "Verifying…" : "Verify & sign in"}
          </button>
        </form>

        <form action={resendAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="email" value={email} />
          {resendState.message && (
            <p className="text-xs text-muted">{resendState.message}</p>
          )}
          <button
            type="submit"
            disabled={resendPending}
            className="btn-ghost px-3 py-1.5 text-sm"
          >
            Resend code
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          Did you use the right address?{" "}
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="text-gold-400 hover:text-gold-300"
          >
            Back to sign in
          </button>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
          placeholder="you@example.com"
        />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
          placeholder="••••••••"
        />
      </div>

      {state.message && !state.ok && (
        <p className="rounded-lg border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative">
          {state.message}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href="/register" className="text-gold-400 hover:text-gold-300">
          Create an account
        </Link>
      </p>
    </form>
  );
}