"use client";
import { useSearchParams } from "next/navigation";
export function AccountGoodbye() {
  const params = useSearchParams();
  return params.get("account") === "closed" ? <p role="status" className="fixed bottom-5 left-5 z-50 rounded-xl bg-card border p-5 shadow-lg">Goodbye — your account has been closed.</p> : null;
}
