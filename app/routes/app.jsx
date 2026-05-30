import { Outlet, useLoaderData, useRouteError } from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  // If there's no host param, Shopify Admin opened the app without embedding context
  // (e.g. from search with ?link_source=search). We can't run authenticate.admin
  // without it — redirect to auth/login so Shopify can re-initiate the OAuth/embed flow.
  const host = url.searchParams.get("host");
  if (!host) {
    const shop = url.searchParams.get("shop");
    if (shop) {
      throw redirect(`/auth/login?shop=${shop}`);
    }
    // No shop either — redirect to login page to collect shop domain
    throw redirect("/auth/login");
  }

  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();
  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/videos">Videos</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};