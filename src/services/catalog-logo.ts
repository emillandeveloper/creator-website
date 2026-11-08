import sharp from "sharp";
import { Level38Error } from "../modules/level38/errors";

export async function catalogLogo(value: unknown): Promise<Buffer | undefined> {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 7_000_000) throw new Level38Error(413, "El logo no puede superar los 5 MB.");
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new Level38Error(400, "Sube un logo PNG, JPG o WebP.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 5 * 1024 * 1024) throw new Level38Error(413, "El logo no puede superar los 5 MB.");
  const raster = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
    (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP");
  if (!raster) throw new Level38Error(400, "Sube una imagen PNG, JPG o WebP válida.");
  try {
    const image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" });
    const meta = await image.metadata();
    if (!["png", "jpeg", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) > 1) throw new Error("Unsupported image");
    const output = await image.rotate().resize({ width: 1600, height: 900, fit: "inside", withoutEnlargement: true }).webp({ lossless: true }).toBuffer();
    if (output.length > 2 * 1024 * 1024) throw new Error("Image is too large");
    return output;
  } catch {
    throw new Level38Error(400, "No se puede leer ese logo. Usa una imagen PNG, JPG o WebP estática de hasta 20 megapíxeles.");
  }
}
