import { createHmac, timingSafeEqual } from "crypto";
import { Request } from "express";
import { Level38Error } from "../errors";

export function verifyWebhook(req: Request, secret: string, now = Date.now()) {
  const id = req.get("Twitch-Eventsub-Message-Id") ?? "";
  const timestamp = req.get("Twitch-Eventsub-Message-Timestamp") ?? "";
  const signature = req.get("Twitch-Eventsub-Message-Signature") ?? "";
  if (!Buffer.isBuffer(req.body) || !id || id.length > 256 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(timestamp) || !/^sha256=[a-f0-9]{64}$/.test(signature)) throw new Level38Error(403, "Invalid Twitch signature.");
  const expected = createHmac("sha256", secret).update(id).update(timestamp).update(req.body).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"))) throw new Level38Error(403, "Invalid Twitch signature.");
  const at = new Date(timestamp);
  if (!Number.isFinite(at.getTime()) || now - at.getTime() > 600000 || at.getTime() - now > 60000) throw new Level38Error(403, "Expired Twitch message.");
  const type = req.get("Twitch-Eventsub-Message-Type");
  if (!["notification", "webhook_callback_verification", "revocation"].includes(type ?? "")) throw new Level38Error(400, "Unsupported Twitch message.");
  let body;
  try { body = JSON.parse(req.body.toString("utf8")); } catch { throw new Level38Error(400, "Invalid Twitch JSON."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Level38Error(400, "Invalid Twitch message.");
  return { id, at, type, body };
}
