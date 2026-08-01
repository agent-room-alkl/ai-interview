import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Billing APIs (/api/billing/*) auth in-route and return JSON 401.
// Do not list them here: Clerk protect() rewrites unauthenticated API
// calls to HTML 404, which surfaced as "Network error starting checkout."
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/interview(.*)",
  "/billing(.*)",
  "/api/interview(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
