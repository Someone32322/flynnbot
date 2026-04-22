const { MessageFlags } = require("discord.js");
const { GuildConfig } = require("../models/GuildConfig");
const { handlePaginationButton } = require("../lib/pagination");

// Commands exempt from per-guild settings checks (always accessible)
const GLOBAL_COMMANDS = new Set(['help']);

function normalizeDeferredPayload(payload) {
  if (typeof payload === "string") {
    return { content: payload };
  }

  if (!payload) {
    return {};
  }

  const normalized = { ...payload };
  delete normalized.flags;
  return normalized;
}

module.exports = {
  name: "interactionCreate",
  async execute(interaction) {
    if (interaction.isButton() && interaction.customId.startsWith("paginate:")) {
      await handlePaginationButton(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      await interaction.reply({
        content: "This command is not available.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!interaction.guildId) {
      await interaction.reply({
        content: "Commands can only run inside a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // ── Guild command restrictions ──────────────────────────────
    // /help is always accessible; all other commands must be enabled via dashboard
    let guildConfig = null;
    let cmdSettings = null;

    if (!GLOBAL_COMMANDS.has(interaction.commandName)) {
      guildConfig = await GuildConfig.findOne({ guildId: interaction.guildId });

      cmdSettings = guildConfig?.commandSettings?.get(interaction.commandName) ?? null;

      // Must be explicitly enabled by an admin through the dashboard
      if (!cmdSettings?.enabled) {
        await interaction.reply({
          content: `The \`/${interaction.commandName}\` command hasn't been enabled for this server yet. A server admin can enable it from the [FlynnBot Dashboard](${process.env.DASHBOARD_URL || 'http://localhost:3000'}).`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Role restriction check
      if (cmdSettings.allowedRoles?.length > 0) {
        const memberRoleIds = interaction.member.roles.cache.map((r) => r.id);
        const allowed = cmdSettings.allowedRoles.some((id) => memberRoleIds.includes(id));
        if (!allowed) {
          await interaction.reply({
            content: "You don't have the required role to use this command.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }

      // Channel restriction check
      if (cmdSettings.allowedChannels?.length > 0) {
        if (!cmdSettings.allowedChannels.includes(interaction.channelId)) {
          await interaction.reply({
            content: "This command cannot be used in this channel.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }
    }

    // ── Response mode (ephemeralMode per command settings) ──────
    // 'off' = force public; everything else = ephemeral (safe default)
    const isPublic = cmdSettings?.ephemeralMode === 'off';
    const deferFlags = isPublic ? {} : { flags: MessageFlags.Ephemeral };

    const originalReply = interaction.reply.bind(interaction);
    const originalEditReply = interaction.editReply.bind(interaction);
    const originalDeferReply = interaction.deferReply.bind(interaction);

    interaction.deferReply = async (options = deferFlags) => {
      if (interaction.deferred || interaction.replied) {
        return interaction;
      }

      await originalDeferReply(isPublic ? {} : options);
      return interaction;
    };

    interaction.reply = async (payload) => {
      if (interaction.deferred || interaction.replied) {
        return originalEditReply(normalizeDeferredPayload(payload));
      }

      return originalReply(payload);
    };

    interaction.editReply = async (payload) => {
      return originalEditReply(normalizeDeferredPayload(payload));
    };

    try {
      await interaction.deferReply(deferFlags);
    } catch (error) {
      if (error?.code === 10062) {
        return;
      }

      throw error;
    }

    // Legacy requiredFeature check (kept for backwards compatibility)
    if (command.requiredFeature && guildConfig) {
      if (guildConfig.features?.[command.requiredFeature] === false) {
        await interaction.editReply({
          content: `This server has the ${command.requiredFeature} feature disabled.`,
        });
        return;
      }
    }

    try {
      await command.execute(interaction, { guildConfig });
    } catch (error) {
      console.error(`Command failed (${interaction.commandName}):`, error);

      if (error?.code === 10062) {
        return;
      }

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "There was an error while running that command.",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: "There was an error while running that command.",
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        if (replyError?.code !== 40060 && replyError?.code !== 10062) {
          console.error(`Failed to send error response for ${interaction.commandName}:`, replyError);
        }
      }
    }
  },
};
