"use client";

import { useEffect, useRef, useState } from "react";
import { testimonials } from "@/lib/testimonials";

const AUTO_MS = 60_000;
const STEP = 3;
const COUNT = testimonials.length;

function norm(i: number): number {
  return ((i % COUNT) + COUNT) % COUNT;
}

export function TestimonialCarousel() {
  const [base, setBase] = useState(0);
  const [phase, setPhase] = useState<"in" | "out">("in");
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);
  const busy = useRef(false);

  const go = (delta: number) => {
    if (busy.current) return;
    busy.current = true;
    setDir(delta);
    setPhase("out");
    setTimeout(() => {
      setBase((b) => norm(b + delta));
      setPhase("in");
      busy.current = false;
    }, 360);
  };

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => go(STEP), AUTO_MS);
    return () => clearInterval(id);
  }, [paused, base]);

  const idx = [norm(base), norm(base + 1), norm(base + 2)];
  const visible = idx.map((i) => testimonials[i]);

  const animClass =
    phase === "in"
      ? dir > 0
        ? "anim-in-right"
        : "anim-in-left"
      : dir > 0
        ? "anim-out-left"
        : "anim-out-right";

  return (
    <section
      className="card space-y-5 p-6 sm:p-8"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            What our members say
          </h2>
        </div>
        <p className="text-xs text-muted" aria-live="polite">
          Testimonial{" "}
          {idx.map((n, i) => (
            <span key={i}>
              {i > 0 ? " · " : ""}
              {n + 1}
            </span>
          ))}{" "}
          of {COUNT}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3" aria-live="polite">
        {visible.map((t, i) => (
          <figure
            key={`${base}-${i}`}
            className={`card flex flex-col justify-between gap-4 border-line/70 p-5 ${animClass}`}
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <blockquote className="text-sm leading-relaxed text-muted">
              {t.text}
            </blockquote>
            <figcaption className="text-right text-sm font-semibold text-gold-300">
              — {t.name}
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          className="btn-ghost px-4"
          onClick={() => go(-1)}
          aria-label="Previous testimonials"
        >
          ‹ Prev
        </button>
        <button
          type="button"
          className="btn-ghost px-4"
          onClick={() => go(1)}
          aria-label="Next testimonials"
        >
          Next ›
        </button>
      </div>
    </section>
  );
}