const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require("discord.js");
const crypto = require("node:crypto");
const SAPPHIRE_COLOR = 0x0f52ba;

function createPaginationSession(client, ownerId, title, pages) {
  const token = crypto.randomUUID();
  client.paginationSessions.set(token, {
    ownerId,
    title,
    pages,
    createdAt: Date.now(),
  });

  return token;
}

function buildPaginationPayload(client, token, pageIndex) {
  const session = client.paginationSessions.get(token);
  if (!session) {
    return null;
  }

  const safeIndex = Math.min(Math.max(pageIndex, 0), session.pages.length - 1);
  const embed = new EmbedBuilder()
    .setColor(SAPPHIRE_COLOR)
    .setTitle(session.title)
    .setDescription(session.pages[safeIndex])
    .setFooter({ text: `Page ${safeIndex + 1} of ${session.pages.length}` });

  if (session.pages.length === 1) {
    return { embeds: [embed] };
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`paginate:${token}:${safeIndex - 1}`)
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safeIndex === 0),
    new ButtonBuilder()
      .setCustomId(`paginate:${token}:${safeIndex + 1}`)
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safeIndex === session.pages.length - 1)
  );

  return {
    embeds: [embed],
    components: [row],
  };
}

async function handlePaginationButton(interaction) {
  const [, token, pageValue] = interaction.customId.split(":");
  const session = interaction.client.paginationSessions.get(token);

  if (!session) {
    await interaction.reply({
      content: "This moderation page expired. Run the command again.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (session.ownerId !== interaction.user.id) {
    await interaction.reply({
      content: "Only the command invoker can use these buttons.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const payload = buildPaginationPayload(interaction.client, token, Number(pageValue));
  await interaction.update(payload);
  return true;
}

function prunePaginationSessions(client) {
  const maxAgeMs = 15 * 60 * 1000;
  const now = Date.now();

  for (const [token, session] of client.paginationSessions.entries()) {
    if (now - session.createdAt > maxAgeMs) {
      client.paginationSessions.delete(token);
    }
  }
}

module.exports = {
  buildPaginationPayload,
  createPaginationSession,
  handlePaginationButton,
  prunePaginationSessions,
};
