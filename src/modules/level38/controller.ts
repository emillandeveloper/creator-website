import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { Level38Auth } from "./auth";
import { Level38Error } from "./errors";
import { Level38Service } from "./service";
import { bodyObject, identifier, nickname, pollAction, pollInput, questAction, revision, textInput } from "./validation";

export class Level38Controller {
  constructor(
    private readonly db: PrismaClient,
    private readonly auth: Level38Auth,
    private readonly service: Level38Service,
  ) {}

  publicPage = async (_req: Request, res: Response): Promise<void> => {
    res.render("level38/index", { state: await this.service.state() });
  };

  controlPage = async (req: Request, res: Response): Promise<void> => {
    const operator = await this.auth.operator(req);
    res.render("level38/control", { operator: operator ? { name: operator.name, role: operator.role } : null });
  };

  publicState = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.service.state());
  };

  controlState = async (req: Request, res: Response): Promise<void> => {
    const operator = await this.auth.requireOperator(req);
    res.json({ ...await this.service.state(true), operator: { name: operator.name, role: operator.role } });
  };

  session = async (req: Request, res: Response): Promise<void> => {
    const participant = await this.auth.viewer(req) ?? await this.auth.createViewer(res);
    res.json({ nickname: participant.nickname, role: "VIEWER", votes: await this.service.viewerVotes(participant.id) });
  };

  join = async (req: Request, res: Response): Promise<void> => {
    const name = nickname(bodyObject(req.body).nickname);
    const participant = await this.auth.viewer(req);
    if (!participant) throw new Level38Error(401, "Your viewer session expired. Reload the page to join again.");
    await this.db.participant.update({ where: { id: participant.id }, data: { nickname: name } });
    res.json({ nickname: name, role: "VIEWER" });
  };

  login = async (req: Request, res: Response): Promise<void> => {
    await this.auth.login(req, res, bodyObject(req.body).key);
    res.json({ ok: true });
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    await this.auth.logout(req, res);
    res.json({ ok: true });
  };

  changeQuest = async (req: Request, res: Response): Promise<void> => {
    const operator = await this.auth.requireOperator(req);
    const body = bodyObject(req.body);
    const state = await this.service.changeQuest(operator.id, identifier(req.params.id), questAction(body.action), revision(body.controlRevision ?? body.revision));
    res.json(state);
  };

  changeGame = async (req: Request, res: Response): Promise<void> => {
    const operator = await this.auth.requireOperator(req);
    const body = bodyObject(req.body);
    const state = await this.service.changeGame(operator.id, body.gameId === null ? null : identifier(body.gameId), revision(body.controlRevision ?? body.revision));
    res.json(state);
  };

  savePoll = async (req: Request, res: Response): Promise<void> => {
    const operator = await this.auth.requireOperator(req);
    const body = bodyObject(req.body);
    res.json(await this.service.savePoll(operator.id, req.params.id ? identifier(req.params.id) : null, pollInput(body), revision(body.controlRevision ?? body.revision)));
  };

  changePoll = async (req: Request, res: Response): Promise<void> => {
    const operator = await this.auth.requireOperator(req);
    const body = bodyObject(req.body);
    res.json(await this.service.changePoll(operator.id, identifier(req.params.id), pollAction(body.action), revision(body.controlRevision ?? body.revision)));
  };

  selectWinner = async (req: Request, res: Response): Promise<void> => {
    const operator = await this.auth.requireOperator(req);
    const body = bodyObject(req.body);
    const reason = body.overrideReason === undefined || body.overrideReason === null ? null : textInput(body.overrideReason, "Override reason", 240);
    res.json(await this.service.selectWinner(operator.id, identifier(req.params.id), identifier(body.optionId), reason, revision(body.controlRevision ?? body.revision)));
  };

  vote = async (req: Request, res: Response): Promise<void> => {
    const participant = await this.auth.viewer(req);
    if (!participant) throw new Level38Error(401, "Your viewer session expired. Reload to join again.");
    res.json(await this.service.vote(participant.id, identifier(req.params.id), identifier(bodyObject(req.body).optionId)));
  };

  undo = async (req: Request, res: Response): Promise<void> => {
    const operator = await this.auth.requireOperator(req);
    const body = bodyObject(req.body);
    res.json(await this.service.undo(operator.id, identifier(body.auditId), revision(body.controlRevision ?? body.revision)));
  };

  configureGame = async (req: Request, res: Response): Promise<void> => {
    const operator = await this.auth.requireOwner(req);
    const body = bodyObject(req.body);
    if (typeof body.enabled !== "boolean" || !Number.isInteger(body.sortOrder) || Number(body.sortOrder) < 0 || Number(body.sortOrder) > 10000) throw new Level38Error(400, "Provide enabled and a sort order from 0 to 10000.");
    if (body.imagePath !== null && (typeof body.imagePath !== "string" || !/^\/img\/[a-zA-Z0-9/_-]+\.(png|jpe?g|webp|gif|svg)$/.test(body.imagePath))) throw new Level38Error(400, "Use a local /img/ image path or null.");
    res.json(await this.service.configureGame(operator.id, identifier(req.params.id), { title: textInput(body.displayName, "Game name"), enabled: body.enabled, sortOrder: Number(body.sortOrder), imagePath: body.imagePath }, revision(body.controlRevision ?? body.revision)));
  };
}
