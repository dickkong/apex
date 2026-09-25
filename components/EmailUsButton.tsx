"use client";

import { useState } from "react";

export const SUPPORT_EMAIL = "apexrender@agentmail.to";

export function EmailUsButton() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — the address is already visible to copy by hand
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost w-full">
        ✉ Email us
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Email support"
        >
          <div
            className="card w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold tracking-wide">
                  Email us
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Reach the support desk at the address below. Attach your
                  registered email so we can match your account.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-line bg-surface2 px-2 py-1 text-sm text-muted hover:text-foreground"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-gold-600/40 bg-maroon-900/40 px-4 py-3 text-center">
              <p className="font-mono text-lg font-semibold text-gold-300">
                {SUPPORT_EMAIL}
              </p>
            </div>

            <div className="mt-4 flex gap-2">
              <button type="button" onClick={copy} className="btn-primary flex-1">
                {copied ? "Copied" : "Copy address"}
              </button>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="btn-ghost flex-1"
              >
                Open mail app
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}