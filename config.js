// Public configuration only. Production build regenerates this file from .env.
window.APP_CONFIG = Object.freeze({ apiUrl: "https://api.example.invalid", repositoryUrl: "https://github.com/ming32409-boop/LINE-", links: {} });
document.querySelectorAll("[data-config-link]").forEach((el) => {
  const key = el.dataset.configLink;
  const url = window.APP_CONFIG[key] || window.APP_CONFIG.links?.[key];
  if (url) { el.href = url; el.hidden = false; }
  else el.hidden = true;
});

document.querySelectorAll("[data-config-section]").forEach((el) => {
  el.hidden = !window.APP_CONFIG.links?.[el.dataset.configSection];
});
