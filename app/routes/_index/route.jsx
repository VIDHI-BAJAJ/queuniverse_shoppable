import { redirect } from "react-router";
import { login } from "../../shopify.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  // Always redirect to /app, preserving any query params (shop, host, etc.)
  // This prevents the default Shopify template login page from showing
  // when navigating back to the app root from within Shopify Admin.
  throw redirect(`/app?${url.searchParams.toString()}`);
};

// Fallback: if somehow the loader doesn't redirect, send to /app
export default function Index() {
  if (typeof window !== "undefined") {
    window.location.replace("/app");
  }
  return null;
}