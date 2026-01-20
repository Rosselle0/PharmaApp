"use client";

import { useEffect, useMemo, useState } from "react";
import "./punch.css";
import { useRouter } from "next/navigation";



type PunchType = "IN" | "OUT" | "BREAK_START" | "BREAK_END";

export default function PunchPage() {
    const [emp, setEmp] = useState("");
    const [type, setType] = useState<PunchType>("IN");
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

    const canSubmit = useMemo(() => emp.length >= 3 && emp.length <= 10 && !busy, [emp, busy]);
    const router = useRouter();


    function appendDigit(d: string) {
        setMsg(null);
        setEmp((prev) => (prev.length >= 10 ? prev : prev + d));
    }

    function backspace() {
        setMsg(null);
        setEmp((prev) => prev.slice(0, -1));
    }

    function clearAll() {
        setMsg(null);
        setEmp("");
    }

    async function submit() {
        if (!canSubmit) return;
        setBusy(true);
        setMsg(null);

        try {
            const res = await fetch("/api/punch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeNumber: emp, type }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data?.error || "Punch failed.");
            }

            setMsg({ kind: "ok", text: "Punch enregistré ✅" });
            setEmp(""); // reset for next employee
        } catch (e: any) {
            setMsg({ kind: "err", text: e?.message || "Punch failed." });
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            // digits
            if (e.key >= "0" && e.key <= "9") {
                e.preventDefault();
                appendDigit(e.key);
                return;
            }
            if (e.key === "Backspace") {
                e.preventDefault();
                backspace();
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                clearAll();
                return;
            }
            if (e.key === "Enter") {
                e.preventDefault();
                submit();
                return;
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canSubmit, emp, type]);

    return (
        <main className="punch-page">

            <button
                className="ghost punch-back"
                onClick={() => {
                    document.cookie = "kiosk_unlock_exp=; Max-Age=0; path=/";
                    router.push("/login");
                }}
            >
                ← Back
            </button>

            <div className="punch-bg" aria-hidden="true" />

            <section className="punch-card">
                <header className="punch-header">
                    <div className="punch-logo">RP</div>
                    <div>
                        <h1 className="punch-title">Punch</h1>
                        <p className="punch-subtitle">Entrez votre numéro d’employé</p>
                    </div>
                </header>

                <div className="display" aria-label="Employee number display">
                    {emp.length ? emp : "— — —"}
                </div>

                <div className="type-row">
                    <button className={type === "IN" ? "chip active" : "chip"} onClick={() => setType("IN")} disabled={busy}>
                        Entrée
                    </button>
                    <button className={type === "OUT" ? "chip active" : "chip"} onClick={() => setType("OUT")} disabled={busy}>
                        Sortie
                    </button>
                    <button className={type === "BREAK_START" ? "chip active" : "chip"} onClick={() => setType("BREAK_START")} disabled={busy}>
                        Pause (début)
                    </button>
                    <button className={type === "BREAK_END" ? "chip active" : "chip"} onClick={() => setType("BREAK_END")} disabled={busy}>
                        Pause (fin)
                    </button>
                </div>

                {msg && (
                    <div className={msg.kind === "ok" ? "alert ok" : "alert err"} role="alert">
                        {msg.text}
                    </div>
                )}

                <div className="pad">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                        <button key={d} className="key" onClick={() => appendDigit(d)} disabled={busy}>
                            {d}
                        </button>
                    ))}
                    <button className="key sub" onClick={clearAll} disabled={busy}>Clear</button>
                    <button className="key" onClick={() => appendDigit("0")} disabled={busy}>0</button>
                    <button className="key sub" onClick={backspace} disabled={busy}>⌫</button>
                </div>

                <button className="primary" onClick={submit} disabled={!canSubmit}>
                    {busy ? "…" : "Confirmer"}
                </button>

                <p className="hint">
                    Clavier: chiffres • Entrée: confirmer • Backspace: effacer • Esc: clear
                </p>
            </section>
        </main>
    );
}
