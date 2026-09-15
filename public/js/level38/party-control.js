(function () {
  "use strict";
  const form = document.getElementById("party-config-form");
  if (!form) return;
  let mutate, dirty = false, config = { enabled: true, maxVisible: 30 }, members = new Set();
  const t = (key, params) => window.Level38I18n?.t(key, params) || key;
  function counts() {
    const rendered = config.enabled ? Math.min(members.size, config.maxVisible) : 0;
    document.getElementById("party-counts").textContent = t("{online} online · {rendered} visible · {overflow} overflow", { online: members.size, rendered, overflow: config.enabled ? Math.max(0, members.size - rendered) : 0 });
  }
  window.Level38PartyControl = { render(state, save) {
    mutate = save; config = state.party || config; counts();
    if (!dirty && state.party) {
      form.elements.enabled.checked = config.enabled; form.elements.nameMode.value = config.nameMode; form.elements.maxVisible.value = config.maxVisible;
    }
  } };
  form.addEventListener("input", () => { dirty = true; });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (mutate && await mutate("control/party", { enabled: form.elements.enabled.checked, nameMode: form.elements.nameMode.value, maxVisible: Number(form.elements.maxVisible.value) })) dirty = false;
  });
  document.addEventListener("level38:language", counts);
  if (typeof window.io === "function") {
    const socket = window.io("/level38-party", { path: "/level38/socket.io", auth: { kind: "overlay" } });
    socket.on("party:snapshot", data => { members = new Set(data.members.map(m => m.presenceId)); config = data.config; counts(); });
    socket.on("party:joined", member => { members.add(member.presenceId); counts(); });
    socket.on("party:left", member => { members.delete(member.presenceId); counts(); });
    socket.on("party:config", next => { config = next; counts(); });
    socket.on("disconnect", () => { members.clear(); counts(); });
    window.addEventListener("pagehide", () => { socket.removeAllListeners(); socket.disconnect(); }, { once: true });
  }
})();
