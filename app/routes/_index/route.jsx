import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  // Always redirect to /app preserving any query params Shopify might pass
  throw redirect(`/app?${url.searchParams.toString()}`);
};

export default function Index() {
  return null;
}