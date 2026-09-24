"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function subscribeStandalone(onChange: () => void): () => void {
  const mql = window.matchMedia("(display-mode: standalone)");
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getStandaloneSnapshot(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches;
}

function subscribeNothing(): () => void {
  return () => {};
}

function getIosSnapshot(): boolean {
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent) && !(window as { MSStream?: unknown }).MSStream;
}

export function InstallAppButton() {
  const isStandalone = useSyncExternalStore(subscribeStandalone, getStandaloneSnapshot, () => false);
  const isIOS = useSyncExternalStore(subscribeNothing, getIosSnapshot, () => false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  if (isStandalone || installed) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      {deferredPrompt ? (
        <button type="button" onClick={install} className="btn-primary">
          Install app
        </button>
      ) : isIOS ? (
        <p className="max-w-56 text-right text-xs text-muted">
          Add to Home Screen: Share → “Add to Home Screen”
        </p>
      ) : null}
    </div>
  );
}