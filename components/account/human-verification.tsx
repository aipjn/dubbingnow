"use client";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
interface Turnstile {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
export function HumanVerification({
  onToken,
  action,
  resetKey = 0,
  disabled = false,
}: {
  onToken: (token: string) => void;
  action: "guest_trial";
  resetKey?: number;
  disabled?: boolean;
}) {
  const demo = !process.env.NEXT_PUBLIC_API_BASE_URL;
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const container = useRef<HTMLDivElement>(null),
    callback = useRef(onToken);
  callback.current = onToken;
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [checked, setChecked] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    setChecked(false);
    setError("");
    callback.current("");
  }, [resetKey, action]);
  useEffect(() => {
    if (demo || !sitekey || !container.current || (!ready && !window.turnstile))
      return;
    const api = window.turnstile;
    if (!api) return;
    const id = api.render(container.current, {
      sitekey,
      action,
      theme: "light",
      size: "flexible",
      callback: (token: string) => {
        setError("");
        callback.current(token);
      },
      "expired-callback": () => {
        callback.current("");
        setError("Verification expired. Please try again.");
      },
      "error-callback": () => {
        callback.current("");
        setError("Verification could not finish. Please retry.");
      },
    });
    return () => {
      api.remove(id);
      callback.current("");
    };
  }, [demo, sitekey, ready, resetKey, retry, action]);
  if (demo)
    return (
      <div className="human-verification">
        <label>
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(event) => {
              setChecked(event.target.checked);
              callback.current(
                event.target.checked
                  ? `demo-human.${Date.now()}.${crypto.randomUUID()}`
                  : "",
              );
            }}
          />
          Demo verification
        </label>
        <small>Preview only · This does not verify a real person.</small>
      </div>
    );
  if (!sitekey)
    return (
      <p className="human-error" role="alert">
        Verification is unavailable. Please try again later.
      </p>
    );
  return (
    <div className="human-verification">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onReady={() => setReady(true)}
        onError={() =>
          setError("Verification could not load. Please retry later.")
        }
      />
      <div ref={container} />
      {error && (
        <p className="human-error" role="alert">
          {error}
          <button
            type="button"
            onClick={() => {
              callback.current("");
              setError("");
              setRetry((value) => value + 1);
            }}
          >
            Retry verification
          </button>
        </p>
      )}
    </div>
  );
}
