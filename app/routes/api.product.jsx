const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Cache-Control": "public, max-age=3600",
};

export const loader = async ({ request }) => {
  const { supabase } = await import("../supabase.server.js");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: HEADERS });
  }

  try {
    const url  = new URL(request.url);
    const id   = url.searchParams.get("id");   // numeric product ID
    const shop = url.searchParams.get("shop"); // shop domain

    if (!id || !shop) {
      return new Response(JSON.stringify({ error: "Missing id or shop" }), { headers: HEADERS });
    }

    // Use Shopify Storefront /products.json — fetch with the numeric ID
    // We call it server-side so we can use the shop domain correctly
    const shopUrl = "https://" + shop + "/products.json?ids=" + id + "&limit=1";
    const res = await fetch(shopUrl, {
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) throw new Error("Shopify fetch failed: " + res.status);
    const data = await res.json();
    const products = data.products || [];

    // Find exact match
    let pr = products.find(p => String(p.id) === String(id));
    if (!pr && products.length) pr = products[0];
    if (!pr) {
      return new Response(JSON.stringify({ error: "Product not found" }), { headers: HEADERS });
    }

    const v = pr.variants && pr.variants[0];
    return new Response(JSON.stringify({
      id:               pr.id,
      title:            pr.title,
      handle:           pr.handle,
      price:            Math.round(parseFloat(v?.price || 0) * 100),
      compare_at_price: v?.compare_at_price ? Math.round(parseFloat(v.compare_at_price) * 100) : null,
      image:            pr.images && pr.images[0] ? pr.images[0].src : null,
    }), { headers: HEADERS });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { headers: HEADERS });
  }
};