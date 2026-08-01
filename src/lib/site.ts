/** Canonical public site URL used for SEO (metadataBase, sitemap, canonicals). */
export function getSiteUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    "";
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  return "https://ainterv.com";
}

export const SITE_NAME = "Ainterv";
export const SITE_TAGLINE = "Next answer your best one.";
export const SITE_DEFAULT_TITLE = "Ainterv — AI interview practice that fits your résumé";
export const SITE_DESCRIPTION =
  "Practice job interviews out loud with a résumé-aware AI interviewer and trainer. Get scored coaching, natural voice conversation, and better answers for your next role.";
export const SITE_KEYWORDS = [
  "AI interview practice",
  "mock interview",
  "voice interview coach",
  "résumé-based interview",
  "job interview preparation",
  "behavioral interview practice",
  "Ainterv",
  "AI interviewer",
];
