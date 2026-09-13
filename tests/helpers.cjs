const { spawn } = require("node:child_process");
const { once } = require("node:events");
const net = require("node:net");
const { setTimeout: delay } = require("node:timers/promises");

async function unusedPort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startSite(env = {}, port) {
  port ??= await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["dist/server.js"], {
    env: { ...process.env, NODE_ENV: "test", LEVEL38_ENABLED: "false", LEVEL38_TRUST_PROXY_HOPS: "0", ...env, PORT: String(port), LEVEL38_ORIGIN: origin },
    stdio: "ignore", windowsHide: true,
  });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  };
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (child.exitCode !== null) throw new Error("Site process exited before listening.");
      try {
        const response = await fetch(origin, { signal: AbortSignal.timeout(500) });
        await response.text();
        if (response.ok) return { origin, port, stop };
      } catch {}
      await delay(100);
    }
    throw new Error("Site did not start within 15 seconds.");
  } catch (error) { await stop(); throw error; }
}

module.exports = { startSite };
