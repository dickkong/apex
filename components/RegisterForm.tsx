"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  registerUserAction,
  resendCodeAction,
  verifyEmailAction,
  type ActionState,
} from "@/app/actions";

const initialState: ActionState = { ok: false };

export function RegisterForm() {
  const [email, setEmail] = useState("");
  const [state, formAction, pending] = useActionState(registerUserAction, initialState);
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyEmailAction, initialState);
  const [resendState, resendAction, resendPending] = useActionState(resendCodeAction, initialState);

  if (state.ok && state.needsEmailVerify) {
    return (
      <div className="space-y-4">
        {state.message && (
          <p className="rounded-lg border border-positive/40 bg-positive/10 px-3 py-2 text-sm text-positive">
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
            {verifyPending ? "Verifying…" : "Verify & continue"}
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
          Didn&apos;t get it? Check your spam folder.{" "}
          <Link href="/login" className="text-gold-400 hover:text-gold-300">
            Already verified? Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name" className="label">
          Full name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          minLength={2}
          className="input"
          placeholder="Alexandra Sterling"
        />
      </div>
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
          autoComplete="new-password"
          required
          minLength={8}
          className="input"
          placeholder="At least 8 characters"
        />
      </div>

      {state.message && !state.ok && (
        <p className="rounded-lg border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative">
          {state.message}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Creating account…" : "Create account"}
      </button>

      <p className="rounded-lg border border-line bg-surface2 px-3 py-2 text-xs leading-relaxed text-muted">
        Only real, verifiable email addresses are accepted. After you sign up we send a 6-digit code
        to your inbox to confirm the address, then an admin must approve your account before you can
        deposit, invest, or withdraw.
      </p>

      <p className="text-center text-sm text-muted">
        Already registered?{" "}
        <Link href="/login" className="text-gold-400 hover:text-gold-300">
          Sign in
        </Link>
      </p>
    </form>
  );
}