"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { getApi } from "@/lib/api";
import { ApiError, errorMessage } from "@/lib/api/errors";
import type { ApiErrorCode, BillingPolicy, Session } from "@/lib/api/types";
type AccountContext = {
  session: Session | null;
  policy: BillingPolicy | null;
  loading: boolean;
  error: string;
  errorCode: ApiErrorCode | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};
const Context = createContext<AccountContext | null>(null);
export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [policy, setPolicy] = useState<BillingPolicy | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<ApiErrorCode | null>(null);
  const refresh = useCallback(async () => {
    try {
      const [current, rules] = await Promise.all([
        getApi().getSession(),
        getApi().getPolicy(),
      ]);
      setSession(current);
      setPolicy(rules);
      setError("");
      setErrorCode(null);
    } catch (err) {
      setError(errorMessage(err));
      setErrorCode(err instanceof ApiError ? err.code : null);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh().catch(() => {});
  }, [refresh]);
  const logout = useCallback(async () => {
    await getApi().logout();
    await refresh();
  }, [refresh]);
  return (
    <Context.Provider
      value={{ session, policy, loading, error, errorCode, refresh, logout }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAccount() {
  const value = useContext(Context);
  if (!value) throw new Error("AccountProvider is required.");
  return value;
}
