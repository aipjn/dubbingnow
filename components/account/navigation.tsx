"use client";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { useAccount } from "./provider";
export function AccountNavigation() {
  const { session } = useAccount();
  return (
    <Link className="account-nav" href={session?.user ? "/account" : "/login"}>
      <UserRound size={16} />
      <span>{session?.user ? "My account" : "Sign in"}</span>
    </Link>
  );
}
