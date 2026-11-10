"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getApi } from "@/lib/api";
import { errorMessage } from "@/lib/api/errors";
import type { CreditEntry, Quota, JobHistory } from "@/lib/api/types";
import { useAccount } from "./provider";
export function AccountDashboard() {
  const {
      session,
      policy,
      loading,
      error: sessionError,
      refresh,
      logout,
    } = useAccount(),
    router = useRouter();
  const [quota, setQuota] = useState<Quota | null>(null),
    [jobs, setJobs] = useState<JobHistory>({ items: [], nextCursor: null }),
    [entries, setEntries] = useState<CreditEntry[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (!session?.user) return;
    setName(session.user.displayName);
    let alive = true;
    Promise.all([
      getApi().getQuota(),
      getApi().getCreditHistory(),
      getApi().listJobs(),
    ])
      .then(([balance, history, tasks]) => {
        if (alive) {
          setQuota(balance);
          setEntries(history.items);
          setCursor(history.nextCursor);
          setJobs(tasks);
        }
      })
      .catch((err) => {
        if (alive) setError(errorMessage(err));
      });
    return () => {
      alive = false;
    };
  }, [session?.user?.id]);
  async function action(operation: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <p role="status">Loading your account…</p>;
  if (sessionError)
    return (
      <p className="account-error" role="alert">
        {sessionError}
        <Link href="/login">Sign in again</Link>
      </p>
    );
  if (!session?.user)
    return (
      <div className="account-card">
        <h2>Your credits travel with your account.</h2>
        <p>
          Sign in or create an account to view your balance and credit history.
        </p>
        <div className="account-actions">
          <Link className="button button-dark" href="/login">
            Sign in
          </Link>
          <Link className="button button-light" href="/register">
            Create account
          </Link>
        </div>
      </div>
    );
  return (
    <div className="account-dashboard">
      <div className="account-summary">
        <div className="account-card">
          <span className="eyebrow">AVAILABLE CREDITS</span>
          <strong className="credit-total">
            {quota ? quota.availableCredits : "—"}
          </strong>
          <p>{quota?.reservedCredits || 0} credits reserved for processing</p>
          <Link className="text-link" href="/pricing">
            Compare subscription plans →
          </Link>
        </div>
        <div className="account-card">
          <h2>Hello, {session.user.displayName}.</h2>
          <p>{session.user.email}</p>
          <p>
            {policy
              ? `Standard dubbing: ${policy.creditsPerMinute.standard} credits per minute, billed ${policy.rounding === "per_second" ? "by the second" : "per started minute"}.`
              : "Loading rates…"}
          </p>
          <div className="account-actions">
            <Link className="button button-dark" href="/#dubbing-tool">
              Start dubbing →
            </Link>
            {session.user.role === "admin" && (
              <Link className="button button-light" href="/admin">
                Administration
              </Link>
            )}
            <button
              className="button button-light"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await logout();
                  router.push("/");
                })
              }
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
      <div className="account-summary">
        <form
          className="account-card auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            void action(async () => {
              await getApi().updateProfile({ displayName: name });
              await refresh();
              setNotice("Your profile is updated.");
            });
          }}
        >
          <h2>Your profile</h2>
          <label>
            Display name
            <input
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button className="button button-dark" disabled={busy}>
            Save profile
          </button>
        </form>
        <div className="account-card">
          <h2>Sign-in settings</h2>
          <p>
            Your login and password recovery are managed on the secure sign-in
            page.
          </p>
        </div>
      </div>
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="account-notice" role="status">
          {notice}
        </p>
      )}
      <section className="account-card">
        <h2>Recordings</h2>
        <p>
          Results are available for 24 hours after completion. Open a recording
          to refresh its download link.
        </p>
        <div className="account-table-wrap">
          <table className="account-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Language</th>
                <th>Status</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {jobs.items.map((job) => (
                <tr key={job.id}>
                  <td>{new Date(job.createdAt).toLocaleString()}</td>
                  <td>{job.targetLanguage.toUpperCase()}</td>
                  <td>{job.status}</td>
                  <td>
                    {job.resultAvailable ||
                    !["completed", "failed", "cancelled"].includes(
                      job.status,
                    ) ? (
                      <Link
                        href={`/audio-dubbing?job=${encodeURIComponent(job.id)}`}
                      >
                        Open recording
                      </Link>
                    ) : job.status === "completed" ? (
                      "Result expired"
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!jobs.items.length && <p>No recordings yet.</p>}
        {jobs.nextCursor && (
          <button
            className="button button-light"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const next = await getApi().listJobs(jobs.nextCursor!);
                setJobs((current) => ({
                  items: [...current.items, ...next.items],
                  nextCursor: next.nextCursor,
                }));
              })
            }
          >
            Load more recordings
          </button>
        )}
      </section>
      <section className="account-card">
        <h2>Credit history</h2>
        <p>
          Credits are reserved when a job starts. Failed or cancelled jobs
          return their reservation.
        </p>
        <div className="account-table-wrap">
          <table className="account-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Activity</th>
                <th>Credits</th>
                <th>Available balance</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.createdAt).toLocaleString()}</td>
                  <td>
                    {entry.note}
                    <small>{entry.type.replaceAll("_", " ")}</small>
                  </td>
                  <td>
                    {entry.deltaCredits > 0 ? "+" : ""}
                    {entry.deltaCredits}
                  </td>
                  <td>{entry.balanceAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!entries.length && <p>No credit transactions yet.</p>}
        {cursor && (
          <button
            className="button button-light"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const next = await getApi().getCreditHistory(cursor);
                setEntries((value) => [...value, ...next.items]);
                setCursor(next.nextCursor);
              })
            }
          >
            Load more transactions
          </button>
        )}
      </section>
      {!process.env.NEXT_PUBLIC_API_BASE_URL && (
        <p className="account-demo-note">
          Preview account and credits · Stored in this browser only. No real
          payment or automatic translation occurs.
        </p>
      )}
    </div>
  );
}
