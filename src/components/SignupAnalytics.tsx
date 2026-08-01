"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect } from "react";
import { getStoredUtm, trackEvent } from "@/lib/analytics";

export function SignupAnalytics() {
  const { isSignedIn, user } = useUser();
  useEffect(() => {
    if (!isSignedIn || !user || window.sessionStorage.getItem("ainterv_signup_tracked")) return;
    trackEvent("sign_up", { method: "clerk", ...getStoredUtm() });
    window.sessionStorage.setItem("ainterv_signup_tracked", "1");
  }, [isSignedIn, user]);
  return null;
}
