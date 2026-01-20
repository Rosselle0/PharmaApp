"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

import { useRouter } from "next/navigation";
import "./login.css";

type Mode = "signin" | "signup";

function humanizeAuthError(message?: string) {
  if (!message) return "Something went wrong. Try again.";

  const m = message.toLowerCase();

  // Supabase common ones
  if (m.includes("invalid login credentials"))
    return "Wrong email or password.";
  if (m.includes("email not confirmed"))
    return "Please confirm your email first (check your inbox).";
  if (m.includes("user already registered"))
    return "An account with this email already exists. Try signing in.";
  if (m.includes("password should be at least"))
    return "Password is too short. Use at least 6 characters.";
  if (m.includes("rate limit") || m.includes("too many requests"))
    return "Too many attempts. Wait a bit and try again.";
  if (m.includes("signup is disabled"))
    return "Sign-ups are currently disabled.";

  return message;
}

export default function LoginPage() {
  const supabase = supabaseBrowser();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPunchModal, setShowPunchModal] = useState(false);
  const [managerCode, setManagerCode] = useState("");
  const [punchError, setPunchError] = useState<string | null>(null);
  const [punchLoading, setPunchLoading] = useState(false);

  async function unlockPunch() {
    if (!managerCode.trim()) return;

    setPunchError(null);
    setPunchLoading(true);

    try {
      const res = await fetch("/api/kiosk/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: managerCode.trim() }),
      });

      if (!res.ok) {
        setPunchError("Code invalide");
        return;
      }

      setShowPunchModal(false);
      setManagerCode("");
      router.push("/punch");
    } catch {
      setPunchError("Erreur réseau. Réessaie.");
    } finally {
      setPunchLoading(false);
    }
  }


  const isEmailValid = useMemo(() => {
    // simple + effective enough for UI
    return /^\S+@\S+\.\S+$/.test(email.trim());
  }, [email]);

  const canSubmit = isEmailValid && password.length >= 6 && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);

    try {
      const res =
        mode === "signup"
          ? await supabase.auth.signUp({
            email: email.trim(),
            password,
          })

          : await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

      if (res.error) throw res.error;
      if (mode === "signup" && !res.data.session) {
        setError("Check your email to confirm your account, then sign in.");
        return;
      }
      const me = await fetch("/api/me");
      if (!me.ok) throw new Error("Failed to sync user.");

      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-bg" aria-hidden="true" />
      <section className="login-card">
        <header className="login-header">
          <div className="login-logo">RP</div>
          <div>
            <h1 className="login-title">RxPlanning</h1>
            <p className="login-subtitle">
              {mode === "signin" ? "Sign in to continue" : "Create your account"}
            </p>
          </div>
        </header>
        <div className="login-top-actions">
          <button
            type="button"
            className="ghost punch-top"
            onClick={() => {
              setPunchError(null);
              setManagerCode("");
              setShowPunchModal(true);
            }}
            disabled={loading}
          >
            Punch
          </button>
        </div>




        <form onSubmit={handleSubmit} className="login-form">
          <div className="field">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              required
              aria-invalid={!!email && !isEmailValid}
              disabled={loading}
            />
            {!!email && !isEmailValid && (
              <p className="hint error">Enter a valid email address.</p>
            )}
          </div>

          <div className="field">
            <label className="label" htmlFor="password">
              Password
            </label>

            <div className="password-row">
              <input
                id="password"
                className="input"
                placeholder={mode === "signin" ? "Your password" : "At least 6 characters"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={6}
                disabled={loading}
              />
              <button
                type="button"
                className="ghost"
                onClick={() => setShowPassword((v) => !v)}
                disabled={loading}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {mode === "signup" && password.length > 0 && password.length < 6 && (
              <p className="hint error">Use at least 6 characters.</p>
            )}
          </div>

          {error && (
            <div className="alert" role="alert">
              <span className="alert-dot" aria-hidden="true" />
              <p className="alert-text">{error}</p>
            </div>
          )}

          <button className="primary" disabled={!canSubmit} type="submit">
            {loading ? (
              <span className="spinner" aria-hidden="true" />
            ) : mode === "signin" ? (
              "Sign in"
            ) : (
              "Create account"
            )}
          </button>

          <div className="divider">
            <span />
            <p>{mode === "signin" ? "New here?" : "Already have an account?"}</p>
            <span />
          </div>

          <button
            type="button"
            className="secondary"
            onClick={() => {
              setError(null);
              setMode(mode === "signin" ? "signup" : "signin");
            }}
            disabled={loading}
          >
            {mode === "signin" ? "Create an account" : "Back to sign in"}
          </button>
        </form>
        {showPunchModal && (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setShowPunchModal(false);
            }}
          >
            <div className="modal-card">
              <div className="modal-head">
                <h2 className="modal-title">Manager code</h2>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setShowPunchModal(false)}
                  disabled={punchLoading}
                >
                  ✕
                </button>
              </div>

              <p className="modal-sub">Entrez le code manager pour ouvrir le punch.</p>

              <input
                className="input"
                value={managerCode}
                onChange={(e) => setManagerCode(e.target.value)}
                inputMode="numeric"
                placeholder="Code"
                autoFocus
                disabled={punchLoading}
              />

              {punchError && (
                <div className="alert" role="alert" style={{ marginTop: 10 }}>
                  <span className="alert-dot" aria-hidden="true" />
                  <p className="alert-text">{punchError}</p>
                </div>
              )}

              <button
                type="button"
                className="primary"
                onClick={unlockPunch}
                disabled={punchLoading || managerCode.trim().length === 0}
                style={{ marginTop: 12 }}
              >
                {punchLoading ? <span className="spinner" aria-hidden="true" /> : "Unlock"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setShowPunchModal(false)}
                disabled={punchLoading}
                style={{ marginTop: 8 }}
              >
                Back
              </button>

            </div>
          </div>
        )}

        <footer className="login-footer">
          <p>© {new Date().getFullYear()} RxPlanning</p>
        </footer>
      </section>
    </main>
  );
}
