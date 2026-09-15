(function () {
  "use strict";
  const catalog = window.Level38Translations;
  let preference;
  try { preference = localStorage.getItem("level38:language"); } catch {}
  preference ||= document.cookie.match(/(?:^|;\s*)level38_lang=(es|en)(?:;|$)/)?.[1];
  let lang = catalog.language(preference, navigator.language, document.body.classList.contains("l38-control") || /^\/level38\/control(?:\/|$)/.test(location.pathname));
  const classes = JSON.parse(document.getElementById("l38-class-names")?.dataset.names || "{}");
  const t = (key, params) => catalog.translate(lang, key, params);
  function apply(root = document) {
    for (const node of root.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n, JSON.parse(node.dataset.i18nParams || "{}"));
    for (const attr of ["placeholder", "aria-label", "alt", "content"]) for (const node of root.querySelectorAll(`[data-i18n-${attr}]`)) node.setAttribute(attr, t(node.getAttribute(`data-i18n-${attr}`)));
    document.documentElement.lang = lang;
    for (const button of document.querySelectorAll("[data-language]")) button.setAttribute("aria-pressed", String(button.dataset.language === lang));
  }
  function setLanguage(value) {
    if (!["es", "en"].includes(value)) return;
    lang = value;
    try { localStorage.setItem("level38:language", lang); } catch {}
    document.cookie = `level38_lang=${lang}; Path=/level38; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    apply();
    document.dispatchEvent(new CustomEvent("level38:language", { detail: lang }));
  }
  for (const button of document.querySelectorAll("[data-language]")) button.addEventListener("click", () => setLanguage(button.dataset.language));
  window.Level38I18n = { t, apply, setLanguage, get language() { return lang; }, questText: (quest, field) => catalog.questText(quest, field, lang), className: job => classes[job?.id]?.[lang] || job?.displayNames?.[lang] || job?.displayName || t("Adventurer") };
  apply();
})();
