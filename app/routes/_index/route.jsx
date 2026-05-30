import { redirect } from "react-router";
import { login } from "../../shopify.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");

  // Case 1: Shopify embedded load — has both shop + host params → go to app
  if (shop && host) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  // Case 2: Has shop param only (e.g. OAuth install flow) → go to app, let
  // authenticate.admin handle the OAuth redirect from there
  if (shop) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  // Case 3: No shop param at all (e.g. ?link_source=search from Shopify Admin
  // sidebar, direct URL, or bookmark). Shopify Admin opens the app via an
  // iframe that will add the correct shop+host params on the real load.
  // Just redirect to /app — authenticate.admin will handle re-auth if needed.
  throw redirect("/app");
};

export default function Index() {
  return null;
}