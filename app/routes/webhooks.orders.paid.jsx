import { authenticate } from "../shopify.server";
import { supabase } from "../supabase.server";

export const action = async ({ request }) => {
  const { shop, payload } = await authenticate.webhook(request);

  try {
    const order       = payload;
    const orderValue  = parseFloat(order.total_price || 0);
    const orderNumber = order.order_number;

    /* ── Extended attribution window: 60 minutes (matches liquid) ── */
    const sixtyMinAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    /* Find the most recent video that had a Buy Now click in the last 60 min */
    const { data: videos } = await supabase
      .from("videos")
      .select("id, orders, revenue, last_click_at")
      .eq("shop_id", shop)
      .gte("last_click_at", sixtyMinAgo)
      .order("last_click_at", { ascending: false })
      .limit(1);

    if (videos && videos.length > 0) {
      const video = videos[0];

      /* ── 1. Update cumulative totals on the video row ── */
      await supabase
        .from("videos")
        .update({
          orders:  (video.orders  || 0) + 1,
          revenue: (video.revenue || 0) + orderValue,
        })
        .eq("id", video.id)
        .eq("shop_id", shop);

      /* ── 2. Log to video_events for date-range queries in the dashboard ── */
      const { error: evErr } = await supabase.from("video_events").insert({
        shop_id:    shop,
        video_id:   video.id,
        event_type: "order",
        value:      orderValue,
        created_at: new Date().toISOString(),   // explicit timestamp for date filtering
      });

      if (evErr) {
        console.error(`video_events insert error for order #${orderNumber}:`, evErr.message);
      } else {
        console.log(`✅ Order #${orderNumber} (₹${orderValue}) attributed to video ${video.id} for ${shop}`);
      }

    } else {
      /* ── No click found — still log the order as unattributed for auditing ── */
      console.log(`⚠️  Order #${orderNumber} for ${shop} — no recent video click in last 60 min`);
    }
  } catch (e) {
    console.error("Order webhook error:", e.message);
  }

  return new Response(null, { status: 200 });
};


