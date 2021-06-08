/* TODO: Rewrite this when Discord.js 13 is out. */

import axios from "axios";
import { Snowflake } from "discord.js";
import Makibot from "../Makibot";
import logger from "./logger";
import Server from "./server";

const interactionsClient = axios.create({
  baseURL: "https://discord.com/api/v8",
  headers: {
    "Content-Type": "application/json",
  },
});

/** Payload. Not every field is added, only what we care. */
interface InteractionPayload {
  id: Snowflake;
  token: string;
  type: number;
  data: {
    name: string;
    id: Snowflake;
  };
  member: {
    user: {
      username: string;
      discriminator: string;
      id: Snowflake;
      public_flags: number;
      avatar: string;
    };
    roles: Snowflake[];
  };
  guild_id: string;
}

function sendResponse(event: InteractionPayload, response: string, ephemeral: boolean = false) {
  const payload: any = {
    type: 4,
    data: { content: response },
  };
  if (ephemeral) {
    payload.data.flags = 64;
  }
  logger.debug("[interactions] sending response: ", payload);
  return interactionsClient.post(`/interactions/${event.id}/${event.token}/callback`, payload);
}

type Handler = (client: Makibot, event: InteractionPayload) => Promise<void>;

const handlers: { [name: string]: Handler } = {
  /* { "name": "karma" } */
  async karma(client, event) {
    const guild = client.guilds.cache.get(event.guild_id);
    const server = new Server(guild);
    const member = await server.member(event.member.user.id);


    const totalCount = await client.karma.count(member.id);
    const messageCount = await client.karma.count(member.id, { kind: "message" });
    const upvoteCount = await client.karma.count(member.id, { kind: "upvote" });
    const downvoteCount = await client.karma.count(member.id, { kind: "downvote" });
    const starCount = await client.karma.count(member.id, { kind: "star" });
    const heartCount = await client.karma.count(member.id, { kind: "heart" });
    const waveCount = await client.karma.count(member.id, { kind: "wave" });

    const offset = member.tagbag.tag("karma:offset").get(0);
    const level = member.tagbag.tag("karma:level").get(0);
    const points = totalCount + offset;

    await sendResponse(
      event,
      `🪙 Karma: ${points}      🏅 Nivel: ${level}\n` +
      ` 💬 Mensajes: ${messageCount}      ⏩ Offset: ${offset}\n` +
      ` 👍 ${upvoteCount}   👎 ${downvoteCount}   ⭐ ${starCount}   ❤️ ${heartCount}    👋 ${waveCount}`,
      true
    );
  },
};

function handleApplicationCommand(client: Makibot, event: InteractionPayload) {
  const handler = handlers[event.data.name];
  if (handler) {
    handler(client, event);
  }
}

export function handleInteraction(client: Makibot, event: InteractionPayload) {
  logger.debug("[interactions] received event: ", event);
  switch (event.type) {
    case 2:
      handleApplicationCommand(client, event);
      break;
  }
}
