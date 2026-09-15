import { ownerConfirmations, OwnerAction } from "./owner-tools";
import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { Level38Auth } from "./auth";
import { Level38Error } from "./errors";
import { Level38Service } from "./service";
import { publicClass } from "./classes";
import { joinParticipant } from "./participants";
import { PartyRuntime } from "./party-runtime";
import { TwitchIntegration } from "./twitch/integration";
import { bodyObject, identifier, nickname, pollAction, pollInput, questAction, revision, textInput } from "./validation";

export class Level38Controller {
  constructor(
    private readonly db: PrismaClient,
    private readonly auth: Level38Auth,
    private readonly service: Level38Service,
    private readonly twitch?: TwitchIntegration,
    private readonly party?: PartyRuntime,
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

  partyOverlay = async (req: Request, res: Response): Promise<void> => {
    let preview = 0;
    if (req.query.preview !== undefined) {
      await this.auth.requireOwner(req);
      if (typeof req.query.preview !== "string" || !["1", "5", "15", "30"].includes(req.query.preview)) throw new Level38Error(400, "Choose a preview crowd of 1, 5, 15 or 30.");
      preview = Number(req.query.preview);
    }
    res.render("level38/party-overlay", { preview });
  };

  streamVisibility = async (req: Request, res: Response): Promise<void> => {
    const participant = await this.auth.viewer(req);
    if (!participant) throw new Level38Error(401, "Your viewer session expired. Reload to join again.");
    const visible = bodyObject(req.body).streamVisible;
    if (typeof visible !== "boolean") throw new Level38Error(400, "Choose whether to appear on stream.");
    const changed = await this.db.participant.updateMany({ where: { id: participant.id, expiresAt: { gt: new Date() } }, data: { streamVisible: visible } });
    if (!changed.count) throw new Level38Error(401, "Your viewer session expired. Reload to join again.");
    await this.party?.refreshParticipant(participant.id);
    res.json({ streamVisible: visible });
  };

  configureParty = async (req: Request, res: Response): Promise<void> => {
    const operator = await this.auth.requireOperator(req), body = bodyObject(req.body);
    res.json(await this.service.configureParty(operator.id, { enabled: body.enabled as boolean, nameMode: body.nameMode as string, maxVisible: body.maxVisible as number }, revision(body.controlRevision)));
  };

  controlState = async (req: Request, res: Response): Promise<void> => {
    const operator = await this.auth.requireOperator(req);
    res.json({ ...await this.service.state(true), partyCounts: this.party?.counts() ?? { online: 0, rendered: 0, overflow: 0 }, operator: { name: operator.name, role: operator.role }, twitch: this.twitch ? await this.twitch.status() : null });
  };

  session = async (req: Request, res: Response): Promise<void> => {
    let participant = await this.auth.viewer(req) ?? await this.auth.createViewer(res);
    let classAssigned = false;
    if ((participant.nickname && !participant.classId) || (participant.classId && !participant.variantId)) ({ participant, classAssigned } = await joinParticipant(this.db, participant.id));
    await this.party?.refreshParticipant(participant.id);
    res.json({ nickname: participant.nickname, streamVisible: participant.streamVisible, role: "VIEWER", class: publicClass(participant.classId, participant.variantId), classAssigned,
      votes: await this.service.viewerVotes(participant.id) });
  };

  join = async (req: Request, res: Response): Promise<void> => {
    const name = nickname(bodyObject(req.body).nickname);
    const participant = await this.auth.viewer(req);
    if (!participant) throw new Level38Error(401, "Your viewer session expired. Reload the page to join again.");
    const joined = await joinParticipant(this.db, participant.id, name);
    await this.party?.refreshParticipant(participant.id);
    res.json({ nickname: joined.participant.nickname, streamVisible: joined.participant.streamVisible, role: "VIEWER", class: publicClass(joined.participant.classId, joined.participant.variantId), classAssigned: joined.classAssigned });
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
    const state = await this.service.vote(participant.id, identifier(req.params.id), identifier(bodyObject(req.body).optionId));
    this.party?.vote(participant.id);
    res.json(state);
  };

  undo = async (req: Request, res: Response): Promise<void> => {
    const operator = await this.auth.requireOperator(req);
    const body = bodyObject(req.body);
    res.json(await this.service.undo(operator.id, identifier(body.auditId), revision(body.controlRevision ?? body.revision)));
  };

  ownerTool = async (req: Request, res: Response): Promise<void> => {
    const operator = await this.auth.requireOwner(req);
    const action = req.params.action;
    if (!Object.prototype.hasOwnProperty.call(ownerConfirmations, action)) throw new Level38Error(404, "Owner action not found.");
    const body = bodyObject(req.body);
    res.json(await this.service.ownerTool(operator.id, action as OwnerAction, body.confirmation, revision(body.controlRevision)));
  };

  configureGame = async (req: Request, res: Response): Promise<void> => {
    const operator = await this.auth.requireOwner(req);
    const body = bodyObject(req.body);
    if (typeof body.enabled !== "boolean" || !Number.isInteger(body.sortOrder) || Number(body.sortOrder) < 0 || Number(body.sortOrder) > 10000) throw new Level38Error(400, "Provide enabled and a sort order from 0 to 10000.");
    if (body.imagePath !== null && (typeof body.imagePath !== "string" || !/^\/img\/[a-zA-Z0-9/_-]+\.(png|jpe?g|webp|gif|svg)$/.test(body.imagePath))) throw new Level38Error(400, "Use a local /img/ image path or null.");
    res.json(await this.service.configureGame(operator.id, identifier(req.params.id), { title: textInput(body.displayName, "Game name"), enabled: body.enabled, sortOrder: Number(body.sortOrder), imagePath: body.imagePath }, revision(body.controlRevision ?? body.revision)));
  };

  twitchAction = async (req: Request, res: Response): Promise<void> => {
    const operator = req.params.action === "auto" ? await this.auth.requireOperator(req) : await this.auth.requireOwner(req);
    if (!this.twitch) throw new Level38Error(503, "Twitch integration is disabled.");
    const body = bodyObject(req.body);
    if (req.params.action === "auto") res.json(await this.service.returnToTwitch(operator.id, revision(body.controlRevision), await this.twitch.autoBroadcaster()));
    else if (["sync", "ensure", "recreate"].includes(req.params.action)) { await this.twitch.run(req.params.action as "sync" | "ensure" | "recreate"); res.json({ ok: true }); }
    else throw new Level38Error(404, "Twitch action not found.");
  };

  mapTwitchGame = async (req: Request, res: Response): Promise<void> => {
    const operator = await this.auth.requireOwner(req); const body = bodyObject(req.body);
    const id = body.twitchCategoryId;
    if (id !== null && (typeof id !== "string" || !/^\d{1,30}$/.test(id))) throw new Level38Error(400, "Enter a numeric Twitch category ID, or clear the mapping.");
    const name = body.twitchCategoryName === null ? null : textInput(body.twitchCategoryName, "Twitch category name", 200);
    res.json(await this.service.mapTwitchGame(operator.id, identifier(req.params.id), id, name, revision(body.controlRevision)));
  };
}
