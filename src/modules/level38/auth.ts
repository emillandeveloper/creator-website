import { createHash, randomBytes } from "crypto";
import { CookieOptions, Request, Response } from "express";
import { OperatorRole, PrismaClient } from "@prisma/client";
import { Level38Config } from "./config";
import { Level38Error } from "./errors";

const VIEWER_COOKIE = "level38_viewer";
const OPERATOR_COOKIE = "level38_operator";
const VIEWER_TTL = 365 * 24 * 60 * 60 * 1000;
const OPERATOR_TTL = 12 * 60 * 60 * 1000;

export const newToken = (): string => randomBytes(32).toString("base64url");
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

function cookieToken(req: Request, name: string): string | undefined {
  const part = req.headers.cookie?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  const value = part?.slice(name.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}

export function canOperate(role: string): role is OperatorRole {
  return role === "MODERATOR" || role === "OWNER";
}

export function isOwner(role: string): boolean {
  return role === "OWNER";
}

export class Level38Auth {
  constructor(private readonly db: PrismaClient, private readonly config: Level38Config) {}

  private cookieOptions(operator: boolean): CookieOptions {
    return { httpOnly: true, secure: this.config.secureCookies, sameSite: operator ? "strict" : "lax", path: "/level38" };
  }

  async viewer(req: Request) {
    const token = cookieToken(req, VIEWER_COOKIE);
    if (!token) return null;
    return this.db.participant.findFirst({ where: { tokenHash: hashToken(token), expiresAt: { gt: new Date() } } });
  }

  async createViewer(res: Response) {
    const token = newToken();
    const participant = await this.db.participant.create({
      data: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + VIEWER_TTL) },
    });
    res.cookie(VIEWER_COOKIE, token, { ...this.cookieOptions(false), maxAge: VIEWER_TTL });
    return participant;
  }

  async operator(req: Request) {
    const token = cookieToken(req, OPERATOR_COOKIE);
    if (!token) return null;
    const session = await this.db.operatorSession.findFirst({
      where: { tokenHash: hashToken(token), expiresAt: { gt: new Date() }, operator: { disabled: false } },
      include: { operator: true },
    });
    return session && canOperate(session.operator.role) ? session.operator : null;
  }

  async requireOperator(req: Request) {
    const operator = await this.operator(req);
    if (!operator) throw new Level38Error(401, "Sign in with an operator access key.");
    return operator;
  }

  async requireOwner(req: Request) {
    const operator = await this.requireOperator(req);
    if (!isOwner(operator.role)) throw new Level38Error(403, "This action requires the owner role.");
    return operator;
  }

  async login(req: Request, res: Response, key: unknown): Promise<void> {
    if (typeof key !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(key)) {
      throw new Level38Error(401, "Invalid operator access key.");
    }
    const operator = await this.db.operator.findUnique({ where: { keyHash: hashToken(key) } });
    if (!operator || operator.disabled || !canOperate(operator.role)) {
      throw new Level38Error(401, "Invalid operator access key.");
    }
    const token = newToken();
    const previous = cookieToken(req, OPERATOR_COOKIE);
    await this.db.$transaction(async (tx) => {
      if (previous) await tx.operatorSession.deleteMany({ where: { tokenHash: hashToken(previous) } });
      await tx.operatorSession.create({
        data: { operatorId: operator.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + OPERATOR_TTL) },
      });
    });
    res.cookie(OPERATOR_COOKIE, token, { ...this.cookieOptions(true), maxAge: OPERATOR_TTL });
  }

  async logout(req: Request, res: Response): Promise<void> {
    const token = cookieToken(req, OPERATOR_COOKIE);
    if (token) await this.db.operatorSession.deleteMany({ where: { tokenHash: hashToken(token) } });
    res.clearCookie(OPERATOR_COOKIE, this.cookieOptions(true));
  }
}
