"use client";

import { useEffect } from "react";
import { getStoredUtm, trackEvent } from "@/lib/analytics";

export function BillingAnalytics({
  fulfilled,
  discounted,
}: {
  fulfilled: boolean;
  discounted: boolean;
}) {
  useEffect(() => {
    if (!fulfilled) return;
    const params = { currency: "USD", ...getStoredUtm() };
    trackEvent("purchase", params);
    if (discounted) trackEvent("coupon_applied", { coupon: "1DAY", ...params });
  }, [discounted, fulfilled]);
  return null;
}
