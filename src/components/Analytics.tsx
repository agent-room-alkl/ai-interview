"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getStoredUtm } from "@/lib/analytics";

// The production property is intentionally available without a Vercel env
// edit; an environment value can still override it for previews/tests.
const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-7JPB75VRKY";

export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!measurementId) return;
    const params = new URLSearchParams(window.location.search);
    const utm = Object.fromEntries(
      ["source", "medium", "campaign", "term", "content"].flatMap((key) => {
        const value = params.get(`utm_${key}`);
        return value ? [[`utm_${key}`, value]] : [];
      }),
    );
    if (Object.keys(utm).length) {
      window.localStorage.setItem("ainterv_utm", JSON.stringify({ ...getStoredUtm(), ...utm }));
    }
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag(..._args: unknown[]) {
      window.dataLayer?.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", measurementId, { send_page_view: false });
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!measurementId || !pathname || typeof window.gtag !== "function") return;
    window.gtag("event", "page_view", {
      page_location: window.location.href,
      page_path: `${pathname}${window.location.search}`,
      page_title: document.title,
      ...getStoredUtm(),
    });
  }, [pathname]);
  return null;
}
