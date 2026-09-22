"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginUserAction, type ActionState } from "@/app/actions";

const initialState: ActionState = { ok: false };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginUserAction, initialState);

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