/* A distinct cookie-authenticated socket starts only AFTER the HTTP session resolves. */
(function () {
  "use strict";
  let socket, timer, active = false;
  function register() { if (active && socket?.connected) socket.emit("party:register", {}); }
  function stop() {
    clearInterval(timer); timer = null;
    if (socket) { socket.emit("party:leave"); socket.removeAllListeners(); socket.disconnect(); socket = null; }
  }
  function update(viewer) {
    active = !!(viewer?.nickname && viewer?.class);
    if (!active) { stop(); return; }
    if (socket || typeof window.io !== "function") return;
    socket = window.io("/level38-party", { path: "/level38/socket.io", auth: { kind: "viewer" }, transports: ["websocket"], forceNew: true });
    socket.on("connect", register);
    timer = setInterval(() => {
      if (socket?.connected) socket.emit("party:heartbeat", {}, reply => { if (!reply?.registered) register(); });
    }, 20000);
  }
  window.addEventListener("pagehide", stop);
  window.addEventListener("pageshow", () => { if (active) update({ nickname: true, class: true }); });
  window.Level38PartyViewer = { update, stop };
})();
