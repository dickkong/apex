"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerUserAction, type ActionState } from "@/app/actions";

const initialState: ActionState = { ok: false };

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerUserAction, initialState);

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
        New accounts are gated behind an identity-verification step. An admin must approve your
        account before you can deposit, invest, or withdraw.
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