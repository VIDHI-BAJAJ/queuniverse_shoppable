import { Outlet, useLoaderData, useRouteError } from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate, login } from "../shopify.server";

export const loader = async ({ request }) => {
  try {
    await authenticate.admin(request);
  } catch (error) {
    // authenticate.admin throws a redirect Response for OAuth — let it through
    if (error instanceof Response) throw error;

    // Any other error (expired session, missing session, etc.)
    // Redirect to login so Shopify re-initiates the auth flow
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    if (shop) {
      throw redirect(`/auth/login?shop=${shop}`);
    }
    throw redirect("/auth/login");
  }

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