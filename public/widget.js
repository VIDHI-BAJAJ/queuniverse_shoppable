(function () {
  // Always use the myshopify domain
  const shop = window.Shopify?.shop;
  if (!shop) return;

  const API = "https://queuniverse-shoppable.vercel.app/api/videos";
  const isHome = window.location.pathname === "/";
  const isPDP = window.location.pathname.includes("/products/");

  if (!isHome && !isPDP) return;

  const page = isHome ? "home" : "pdp";
  const url = `${API}?shop=${shop}&page=${page}`;

  fetch(url)
    .then((r) => r.json())
    .then(({ videos }) => {
      if (!videos || videos.length === 0) return;

      const container = document.createElement("div");
      container.id = "nq-shoppable-widget";
      container.style.cssText = "width:100%;overflow-x:auto;display:flex;gap:12px;padding:16px;background:#f9f9f9;margin:20px 0;";

      videos.forEach((video) => {
        const wrap = document.createElement("div");
        wrap.style.cssText = "min-width:280px;border-radius:12px;overflow:hidden;background:#000;flex-shrink:0;";

        const vid = document.createElement("video");
        vid.src = video.r2_url;
        vid.controls = true;
        vid.muted = true;
        vid.playsInline = true;
        vid.style.cssText = "width:100%;height:400px;object-fit:cover;display:block;";

        wrap.appendChild(vid);
        container.appendChild(wrap);
      });

      const target = document.querySelector("main") || document.body;
      target.insertBefore(container, target.firstChild);
    })
    .catch(err => console.log("NQ Widget error:", err));
})();