/* NQ Shoppable — Web Pixel
   Tracks order completions and attributes them back to the last watched video.
   Works with standard Shopify checkout AND Gokwik external checkout.

   Flow:
   1. On any page: if sessionStorage has nq_last_video, keep it alive
   2. On checkout_completed / purchase event: fire order event to our tracker
   3. Also listens for Gokwik's custom postMessage events
*/

const TRACK = "https://queuniverse-shoppable.vercel.app/api/track";

/* ── Helper: fire order event ── */
function fireOrder(shop, videoId, orderValue) {
  var url = TRACK
    + "?video_id=" + encodeURIComponent(videoId)
    + "&shop="     + encodeURIComponent(shop)
    + "&event=order"
    + "&value="    + (orderValue || 0);

  fetch(url, { method: "GET", keepalive: true }).catch(function () {});
}

/* ── 1. Standard Shopify checkout_completed event ── */
analytics.subscribe("checkout_completed", function (event) {
  try {
    var shop       = event.context.document.location.host;
    var orderValue = event.data.checkout.totalPrice
                   ? parseFloat(event.data.checkout.totalPrice.amount)
                   : 0;

    /* Read last video from browser storage */
    var stored = browser.sessionStorage.getItem("nq_last_video");
    if (!stored) stored = browser.localStorage.getItem("nq_last_video_backup");
    if (!stored) return;

    var last = JSON.parse(stored);
    /* Only attribute if within 30 minutes of clicking Shop Now */
    if (Date.now() - last.ts > 30 * 60 * 1000) return;

    fireOrder(last.shop || shop, last.id, orderValue);
    browser.sessionStorage.removeItem("nq_last_video");
    browser.localStorage.removeItem("nq_last_video_backup");
  } catch (e) {}
});

/* ── 2. page_viewed — keep sessionStorage alive across Gokwik redirects ──
   Gokwik redirects to an external payment page and back, which can wipe
   sessionStorage. We back it up to localStorage on every page view. */
analytics.subscribe("page_viewed", function (event) {
  try {
    var stored = browser.sessionStorage.getItem("nq_last_video");
    if (stored) {
      /* Backup to localStorage so it survives cross-origin redirects */
      browser.localStorage.setItem("nq_last_video_backup", stored);
    } else {
      /* Try to restore from backup */
      var backup = browser.localStorage.getItem("nq_last_video_backup");
      if (backup) {
        var parsed = JSON.parse(backup);
        /* Only restore if within 30 minutes */
        if (Date.now() - parsed.ts < 30 * 60 * 1000) {
          browser.sessionStorage.setItem("nq_last_video", backup);
        } else {
          browser.localStorage.removeItem("nq_last_video_backup");
        }
      }
    }
  } catch (e) {}
});

/* ── 3. payment_info_submitted — Gokwik fires this before redirecting ── */
analytics.subscribe("payment_info_submitted", function (event) {
  try {
    /* Backup again right before payment redirect */
    var stored = browser.sessionStorage.getItem("nq_last_video");
    if (stored) {
      browser.localStorage.setItem("nq_last_video_backup", stored);
    }
  } catch (e) {}
});