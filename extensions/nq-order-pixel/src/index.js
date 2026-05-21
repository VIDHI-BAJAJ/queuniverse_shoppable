analytics.subscribe("checkout_completed", (event) => {
  const order = event.data.checkout;
  if (!order) return;

  // Read the video click saved by the widget in localStorage
  const stored = browser.localStorage.getItem("nq_last_click");
  if (!stored) return;

  let last;
  try { last = JSON.parse(stored); } catch(e) { return; }

  // 60 minute attribution window
  if (Date.now() - last.ts > 60 * 60 * 1000) {
    browser.localStorage.removeItem("nq_last_click");
    return;
  }

  const orderValue = parseFloat(order.totalPrice?.amount || 0);
  const shop = last.shop;
  const videoId = last.id;

  // Fire to your tracking API
  fetch(
    "https://queuniverse-shoppable.vercel.app/api/track" +
    "?video_id=" + encodeURIComponent(videoId) +
    "&shop="     + encodeURIComponent(shop) +
    "&event=order" +
    "&value="    + orderValue,
    { method: "GET", keepalive: true }
  ).catch(() => {});

  browser.localStorage.removeItem("nq_last_click");
});