"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getApi } from "@/lib/api";
import { errorMessage } from "@/lib/api/errors";
import { validatePolicy } from "@/lib/billing/policy";
import type { BillingPolicy, ManagedUser } from "@/lib/api/types";
import { useAccount } from "./provider";
export function AdminDashboard() {
  const { session, policy, refresh, loading } = useAccount();
  const [rules, setRules] = useState<BillingPolicy | null>(null),
    [users, setUsers] = useState<ManagedUser[]>([]),
    [query, setQuery] = useState(""),
    [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState(""),
    [delta, setDelta] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const adjustment = useRef<{
    id: string;
    input: { deltaCredits: number; reason: string };
    key: string;
  } | null>(null);
  useEffect(() => {
    if (policy) setRules(structuredClone(policy));
  }, [policy]);
  async function load(more = false) {
    const result = await getApi().listUsers(
      query,
      more ? cursor || undefined : undefined,
    );
    setUsers((value) => (more ? [...value, ...result.items] : result.items));
    setCursor(result.nextCursor);
  }
  useEffect(() => {
    if (session?.user?.role === "admin")
      void getApi()
        .listUsers()
        .then((result) => {
          setUsers(result.items);
          setCursor(result.nextCursor);
        })
        .catch((err) => setError(errorMessage(err)));
  }, [session?.user?.id, session?.user?.role]);
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
  if (loading) return <p role="status">Loading administration…</p>;
  if (session?.user?.role !== "admin")
    return (
      <div className="account-card">
        <h2>Administrator access required.</h2>
        <p>
          Sign in with an administrator account to manage users and credit
          settings.
        </p>
        <Link href="/login" className="button button-dark">
          Sign in
        </Link>
      </div>
    );
  return (
    <div className="account-dashboard">
      <form
        className="account-card auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          void action(async () => {
            if (!rules) return;
            validatePolicy(rules);
            await getApi().updatePolicy(rules);
            await refresh();
            setNotice(
              "Credit settings saved. Existing quoted jobs keep their original rate; existing balances are unchanged.",
            );
          });
        }}
      >
        <h2>Credit settings</h2>
        <p>
          Changes apply to new registrations and new quotes. Prices are
          provisional until the API costs are confirmed.
        </p>
        {rules && (
          <div className="policy-fields">
            <label>
              Signup bonus credits
              <input
                type="number"
                min={0}
                step={1}
                required
                value={rules.signupCredits}
                onChange={(event) =>
                  setRules({
                    ...rules,
                    signupCredits: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Guest trial seconds
              <input
                type="number"
                min={1}
                max={rules.maxDurationSeconds}
                step={1}
                required
                value={rules.guestTrialSeconds}
                onChange={(event) =>
                  setRules({
                    ...rules,
                    guestTrialSeconds: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Guest trial uses
              <input
                type="number"
                min={1}
                step={1}
                required
                value={rules.guestTrialUses}
                onChange={(event) =>
                  setRules({
                    ...rules,
                    guestTrialUses: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Standard credits per minute
              <input
                type="number"
                min={1}
                step={1}
                required
                value={rules.creditsPerMinute.standard}
                onChange={(event) =>
                  setRules({
                    ...rules,
                    creditsPerMinute: {
                      ...rules.creditsPerMinute,
                      standard: Number(event.target.value),
                    },
                  })
                }
              />
            </label>
            <label>
              High-fidelity credits per minute
              <input
                type="number"
                min={1}
                step={1}
                required
                value={rules.creditsPerMinute.high_fidelity}
                onChange={(event) =>
                  setRules({
                    ...rules,
                    creditsPerMinute: {
                      ...rules.creditsPerMinute,
                      high_fidelity: Number(event.target.value),
                    },
                  })
                }
              />
            </label>
            <label>
              Billing increment
              <select
                value={rules.rounding}
                onChange={(event) =>
                  setRules({
                    ...rules,
                    rounding: event.target.value as BillingPolicy["rounding"],
                  })
                }
              >
                <option value="per_second">Per second</option>
                <option value="per_minute">Per started minute</option>
              </select>
            </label>
            <label>
              Minimum job credits
              <input
                type="number"
                min={1}
                step={1}
                required
                value={rules.minimumCredits}
                onChange={(event) =>
                  setRules({
                    ...rules,
                    minimumCredits: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Maximum recording seconds
              <input
                type="number"
                min={rules.guestTrialSeconds}
                max={7200}
                step={1}
                required
                value={rules.maxDurationSeconds}
                onChange={(event) =>
                  setRules({
                    ...rules,
                    maxDurationSeconds: Number(event.target.value),
                  })
                }
              />
            </label>
          </div>
        )}
        <button className="button button-dark" disabled={busy || !rules}>
          Save credit settings
        </button>
      </form>
      <section className="account-card">
        <h2>User management</h2>
        <form
          className="admin-search"
          onSubmit={(event) => {
            event.preventDefault();
            void action(() => load());
          }}
        >
          <input
            aria-label="Search users"
            placeholder="Search email or name"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="button button-light" disabled={busy}>
            Search
          </button>
        </form>
        <div className="account-table-wrap">
          <table className="account-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Status</th>
                <th>Credits</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    {user.displayName}
                    <small>{user.email}</small>
                  </td>
                  <td>{user.status}</td>
                  <td>
                    {user.availableCredits}
                    <small>{user.reservedCredits} reserved</small>
                  </td>
                  <td>
                    <button
                      className="text-link"
                      disabled={busy || user.id === session.user!.id}
                      onClick={() =>
                        void action(async () => {
                          await getApi().updateUser(user.id, {
                            status:
                              user.status === "active" ? "suspended" : "active",
                          });
                          await load();
                        })
                      }
                    >
                      {user.status === "active" ? "Suspend" : "Restore"}
                    </button>
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={() => {
                        setSelected(user.id);
                        setDelta("");
                        setReason("");
                        adjustment.current = null;
                      }}
                    >
                      Adjust credits
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cursor && (
          <button
            className="button button-light"
            disabled={busy}
            onClick={() => void action(() => load(true))}
          >
            Load more users
          </button>
        )}
      </section>
      {selected && (
        <form
          className="account-card auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            void action(async () => {
              const input = { deltaCredits: Number(delta), reason };
              if (
                !adjustment.current ||
                adjustment.current.id !== selected ||
                JSON.stringify(adjustment.current.input) !==
                  JSON.stringify(input)
              )
                adjustment.current = {
                  id: selected,
                  input,
                  key: crypto.randomUUID(),
                };
              await getApi().adjustCredits(
                selected,
                input,
                adjustment.current.key,
              );
              adjustment.current = null;
              setSelected("");
              await load();
              setNotice("Credit adjustment recorded.");
            });
          }}
        >
          <h2>Adjust credits</h2>
          <p>{users.find((user) => user.id === selected)?.email}</p>
          <label>
            Credit adjustment
            <input
              type="number"
              step={1}
              required
              value={delta}
              onChange={(event) => setDelta(event.target.value)}
              placeholder="Positive to add, negative to deduct"
            />
          </label>
          <label>
            Reason
            <input
              required
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="account-actions">
            <button className="button button-dark" disabled={busy}>
              Record adjustment
            </button>
            <button
              className="button button-light"
              type="button"
              disabled={busy}
              onClick={() => setSelected("")}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="account-notice">
          {notice}
        </p>
      )}
      {getApi().mode === "demo" && (
        <p className="account-demo-note">
          Preview administration · Changes affect this browser’s demo data only.
        </p>
      )}
    </div>
  );
}
