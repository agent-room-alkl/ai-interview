"use client";

export type AnalyticsEvent =
  | "sign_up"
  | "begin_checkout"
  | "purchase"
  | "coupon_applied"
  | "interview_created"
  | "interview_started"
  | "interview_completed";

type EventParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(name: AnalyticsEvent, params: EventParams = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}

export function getStoredUtm() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem("ainterv_utm") ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
