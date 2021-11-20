/* eslint-disable @typescript-eslint/no-var-requires */
import {
  GuildBan,
  GuildMember,
  Message,
  MessageReaction,
  PartialGuildMember,
  PartialMessage,
  PartialMessageReaction,
  PartialUser,
  User,
  VoiceState,
} from "discord.js";
import requireAll from "require-all";
import Makibot from "../Makibot";
import logger from "./logger";

export interface Hook {
  /* The identifier of the hook. */
  name: string;

  /** Allows restart? */
  allowsRestart?: boolean;

  /** Callback to ask the hook to restart itself. */
  restart?: () => void;

  onMessageCreate?: (message: Message) => Promise<void>;
  onMessageUpdate?: (
    oldMessage: Message | PartialMessage,
    newMessage: Message | PartialMessage
  ) => Promise<void>;
  onMessageDestroy?: (message: PartialMessage) => Promise<void>;

  onMessageReactionAdd?: (reaction: MessageReaction, user: User) => Promise<void>;
  onMessageReactionDestroy?: (reaction: MessageReaction, user: User) => Promise<void>;
  onMessageReactionBulkDestroy?: (message: Message) => Promise<void>;

  onGuildMemberJoin?: (member: GuildMember) => Promise<void>;
  onGuildMemberLeave?: (member: GuildMember | PartialGuildMember) => Promise<void>;
  onGuildMemberBan?: (ban: GuildBan) => Promise<void>;

  onVoiceStateUpdate?: (oldStatus: VoiceState, newStatus: VoiceState) => Promise<void>;
}

/**
 * This function will require and prepare the hooks in the given directory.
 * It will return an array with all the loaded classes that are available to
 * use within the hook manager.
 */
function requireAllHooks(client: Makibot, path: string): Hook[] {
  const required = requireAll({
    dirname: path,
    filter: /^([^.].*)\.[jt]s$/,
  });
  return Object.entries(required)
    .map(([id, klass]) => {
      try {
        if (klass.default && typeof klass.default === "function") {
          /* This is an ES Module, close the definition. */
          klass = klass.default;
        }
        const instance: Hook = new klass(client);
        logger.debug(`[hooks] loaded hook: ${instance.name}`);
        return instance;
      } catch (e) {
        logger.error(`[hooks] failed load hook ${id}: ${e}`);
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Filters the message to validate if it is safe to process. Messages coming from bots,
 * interactions, webhooks or other agents that are non human are not safe to process. Also,
 * the Discord API sometimes likes to send notifications for ephemeral messages even though
 * these messages cannot be retrieved later from the API (thanks, Discord!).
 *
 * @param message the message that needs to be tested
 * @returns true unless the message comes from an unprocessable agent
 */
function isProcessableMessage(message: Message | PartialMessage): boolean {
  return !(message.author.bot || !!message.interaction || message.flags.has("EPHEMERAL"));
}

export class HookManager {
  private watchdog: { [name: string]: Hook } = {};

  private services: Hook[];

  /**
   * Filters the list of services looking for the ones that implement a specific function.
   * @param method the method that the hook has to implement
   * @returns a subset of the hooks that implement this method
   */
  private filterServices(method: string): Hook[] {
    return this.services.filter((srv) => srv[method] && typeof srv[method] === "function");
  }

  async onMessageCreate(message: Message): Promise<void> {
    if (isProcessableMessage(message)) {
      const handlers = this.filterServices("onMessageCreate");
      for (const handler of handlers) {
        logger.debug(`[hooks] processing ${handler.name}(messageCreate)`);
        await handler.onMessageCreate(message);
      }
    }
  }

  async onMessageUpdate(
    oldMessage: Message | PartialMessage,
    newMessage: Message | PartialMessage
  ): Promise<void> {
    if (isProcessableMessage(oldMessage) && isProcessableMessage(newMessage)) {
      const handlers = this.filterServices("onMessageUpdate");
      for (const handler of handlers) {
        logger.debug(`[hooks] processing ${handler.name}(messageUpdate)`);
        await handler.onMessageUpdate(oldMessage, newMessage);
      }
    }
  }

  async onMessageDelete(message: PartialMessage): Promise<void> {
    if (isProcessableMessage(message)) {
      const handlers = this.filterServices("onMessageDestroy");
      for (const handler of handlers) {
        logger.debug(`[hooks] processing ${handler.name}(messageDestroy)`);
        await handler.onMessageDestroy(message);
      }
    }
  }

  async onMessageReactionAdd(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser
  ): Promise<void> {
    const [fullReaction, fullUser] = await Promise.all([reaction.fetch(), user.fetch()]);
    const handlers = this.filterServices("onMessageReactionAdd");
    for (const handler of handlers) {
      logger.debug(`[hooks] processing ${handler.name}(onMessageReactionAdd)`);
      await handler.onMessageReactionAdd(fullReaction, fullUser);
    }
  }

  async onMessageReactionRemove(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser
  ): Promise<void> {
    const [fullReaction, fullUser] = await Promise.all([reaction.fetch(), user.fetch()]);
    const handlers = this.filterServices("onMessageReactionDestroy");
    for (const handler of handlers) {
      logger.debug(`[hooks] processing ${handler.name}(onMessageReactionDestroy)`);
      await handler.onMessageReactionDestroy(fullReaction, fullUser);
    }
  }

  async onMessageReactionRemoveAll(message: Message | PartialMessage): Promise<void> {
    const fullMessage = await message.fetch();
    const handlers = this.filterServices("onMessageReactionBulkDestroy");
    for (const handler of handlers) {
      logger.debug(`[hooks] processing ${handler.name}(onMessageReactionBulkDestroy)`);
      await handler.onMessageReactionBulkDestroy(fullMessage);
    }
  }

  async onGuildMemberAdd(member: GuildMember): Promise<void> {
    const handlers = this.filterServices("onGuildMemberJoin");
    for (const handler of handlers) {
      logger.debug(`[hooks] processing ${handler.name}(onGuildMemberJoin)`);
      await handler.onGuildMemberJoin(member);
    }
  }

  async onGuildMemberRemove(member: GuildMember | PartialGuildMember): Promise<void> {
    const handlers = this.filterServices("onGuildMemberLeave");
    for (const handler of handlers) {
      logger.debug(`[hooks] processing ${handler.name}(onGuildMemberLeave)`);
      await handler.onGuildMemberLeave(member);
    }
  }

  async onGuildMemberBan(ban: GuildBan): Promise<void> {
    const handlers = this.filterServices("onGuildMemberBan");
    for (const handler of handlers) {
      logger.debug(`[hooks] processing ${handler.name}(onGuildMemberBan)`);
      await handler.onGuildMemberBan(ban);
    }
  }

  async onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const handlers = this.filterServices("onVoiceStateUpdate");
    for (const handler of handlers) {
      logger.debug(`[hooks] processing ${handler.name}(onVoiceStateUpdate)`);
      await handler.onVoiceStateUpdate(oldState, newState);
    }
  }

  constructor(path: string, client: Makibot) {
    this.services = requireAllHooks(client, path);
    logger.debug("[hooks] finished registering services");

    /* Register global entrypoints. */
    client.on("messageCreate", this.onMessageCreate.bind(this));
    client.on("messageUpdate", this.onMessageUpdate.bind(this));
    client.on("messageDelete", this.onMessageDelete.bind(this));
    client.on("messageReactionAdd", this.onMessageReactionAdd.bind(this));
    client.on("messageReactionRemove", this.onMessageReactionRemove.bind(this));
    client.on("messageReactionRemoveAll", this.onMessageReactionRemoveAll.bind(this));
    client.on("guildMemberAdd", this.onGuildMemberAdd.bind(this));
    client.on("guildMemberRemove", this.onGuildMemberRemove.bind(this));
    client.on("voiceStateUpdate", this.onVoiceStateUpdate.bind(this));
  }

  restart(name: string): void {
    logger.debug(`[hooks] restarting service ${name}...`);
    this.watchdog[name]?.restart();
  }
}
