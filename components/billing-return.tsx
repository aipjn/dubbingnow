"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getApi } from "@/lib/api";
import { errorMessage } from "@/lib/api/errors";

export function BillingReturn() {
  const [message, setMessage] = useState("Checking your credits…");
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function check() {
      try {
        const id = new URLSearchParams(window.location.search).get(
          "checkout_id",
        );
        if (!id) {
          setMessage(
            "No checkout reference was provided. View your account for the current credit balance.",
          );
          return;
        }
        const receipt = await getApi().getCheckout(id);
        if (!alive) return;
        if (receipt.status === "paid") {
          setMessage(
            `Payment confirmed. ${receipt.creditsGranted} credits added to your account.`,
          );
        } else if (["expired", "cancelled"].includes(receipt.status)) {
          setMessage("This checkout did not complete. No credits were added.");
        } else if (++attempts < 12) {
          setMessage(
            "Your payment is being confirmed. Waiting for the updated balance…",
          );
          timer = setTimeout(check, 2500);
        } else
          setMessage(
            "Your credits have not been confirmed yet. Check back shortly or contact support. This page does not confirm a payment.",
          );
      } catch (err) {
        if (alive) setMessage(errorMessage(err));
      }
    }
    if (getApi().mode === "demo")
      setMessage("This is a preview. No payment was processed.");
    else void check();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
  return (
    <div className="billing-status" role="status">
      <p>{message}</p>
      <Link className="button button-dark" href="/#dubbing-tool">
        Back to dubbing
      </Link>
    </div>
  );
}
