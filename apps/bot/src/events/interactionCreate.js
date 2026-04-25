const { EmbedBuilder, MessageFlags } = require("discord.js");
const { GuildConfig } = require("../models/GuildConfig");
const { ReactionRole } = require("../models/ReactionRole");
const { ScheduledMessage } = require("../models/ScheduledMessage");
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

    // ── Reaction Role buttons ────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith("rr:btn:")) {
      await handleRRButton(interaction);
      return;
    }

    // ── Reaction Role select menus ───────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("rr:sel:")) {
      await handleRRSelect(interaction);
      return;
    }

    // ── Message Builder action row buttons ───────────────────────
    if (interaction.isButton() && interaction.customId.startsWith("msg:btn:")) {
      await handleMsgButton(interaction);
      return;
    }

    // ── Message Builder action row select menus ──────────────────
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("msg:sel:")) {
      await handleMsgSelect(interaction);
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (command?.autocomplete) {
        try {
          await command.autocomplete(interaction);
        } catch (err) {
          console.error('[Autocomplete error]', interaction.commandName, err);
        }
      }
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
        try {
          await interaction.reply({
            content: `The \`/${interaction.commandName}\` command hasn't been enabled for this server yet. A server admin can enable it from the [FlynnBot Dashboard](${process.env.DASHBOARD_URL || 'http://localhost:3000'}).`,
            flags: MessageFlags.Ephemeral,
          });
        } catch (err) {
          if (err?.code !== 10062) throw err;
        }
        return;
      }

      // Role restriction check
      if (cmdSettings.allowedRoles?.length > 0) {
        const memberRoleIds = interaction.member.roles.cache.map((r) => r.id);
        const allowed = cmdSettings.allowedRoles.some((id) => memberRoleIds.includes(id));
        if (!allowed) {
          try {
            await interaction.reply({
              content: "You don't have the required role to use this command.",
              flags: MessageFlags.Ephemeral,
            });
          } catch (err) {
            if (err?.code !== 10062) throw err;
          }
          return;
        }
      }

      // Channel restriction check
      if (cmdSettings.allowedChannels?.length > 0) {
        if (!cmdSettings.allowedChannels.includes(interaction.channelId)) {
          try {
            await interaction.reply({
              content: "This command cannot be used in this channel.",
              flags: MessageFlags.Ephemeral,
            });
          } catch (err) {
            if (err?.code !== 10062) throw err;
          }
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

// ── Reaction Role helpers ────────────────────────────────────
async function handleRRButton(interaction) {
  try {
    const parts = interaction.customId.split(":");
    // rr:btn:{rrId}:{optId}
    const rrId = parts[2];
    const optId = parts[3];
    const rr = await ReactionRole.findById(rrId);
    if (!rr) return safeReply(interaction, "This reaction role no longer exists.");
    const opt = rr.options.find((o) => o.optId === optId);
    if (!opt) return safeReply(interaction, "This option no longer exists.");
    await executeRRAction(interaction, opt);
  } catch (err) {
    console.error("[RR] Button handler error:", err);
    await safeReply(interaction, "An error occurred processing your request.");
  }
}

async function handleRRSelect(interaction) {
  try {
    const parts = interaction.customId.split(":");
    // rr:sel:{rrId}
    const rrId = parts[2];
    const rr = await ReactionRole.findById(rrId);
    if (!rr) return safeReply(interaction, "This reaction role no longer exists.");
    const selectedOptId = interaction.values[0];
    const opt = rr.options.find((o) => o.optId === selectedOptId);
    if (!opt) return safeReply(interaction, "That option no longer exists.");
    await executeRRAction(interaction, opt);
  } catch (err) {
    console.error("[RR] Select handler error:", err);
    await safeReply(interaction, "An error occurred processing your request.");
  }
}

async function executeRRAction(interaction, opt) {
  if (opt.action === "role") {
    const member = interaction.member ?? await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) return safeReply(interaction, "Could not find your member in this server.");
    const role = interaction.guild.roles.cache.get(opt.roleId);
    if (!role) return safeReply(interaction, "The configured role no longer exists.");
    const hasRole = member.roles.cache.has(opt.roleId);
    if (opt.toggleRole && hasRole) {
      await member.roles.remove(role);
      return safeReply(interaction, `✅ Removed the **${role.name}** role.`);
    } else if (!hasRole) {
      await member.roles.add(role);
      return safeReply(interaction, `✅ You now have the **${role.name}** role.`);
    } else {
      return safeReply(interaction, `You already have the **${role.name}** role.`);
    }
  } else if (opt.action === "message") {
    return safeReply(interaction, buildResponsePayload(opt));
  } else if (opt.action === "dm") {
    try {
      await interaction.user.send(buildResponsePayload(opt));
      return safeReply(interaction, "✅ You have been sent a DM!");
    } catch {
      return safeReply(interaction, "❌ Failed to send you a DM. Please check your privacy settings.");
    }
  }
}

function buildResponsePayload(opt) {
  const content = String(opt?.content || "").trim() || "No message configured.";
  if (opt?.contentType === "embed") {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor(0x0f52ba)
          .setDescription(content),
      ],
    };
  }
  return { content };
}

async function safeReply(interaction, payload) {
  const normalized = typeof payload === "string" ? { content: payload } : { ...(payload || {}) };
  if (!normalized.content && !normalized.embeds?.length) {
    normalized.content = "No message configured.";
  }

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ ...normalized, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ ...normalized, flags: MessageFlags.Ephemeral });
    }
  } catch (_) {}
}

// ── Message Builder action row handlers ──────────────────────
async function handleMsgButton(interaction) {
  try {
    const parts = interaction.customId.split(":");
    // msg:btn:{msgId}:{optId}
    const msgId = parts[2];
    const optId = parts[3];
    const msg = await ScheduledMessage.findById(msgId).catch(() => null);
    if (!msg) return safeReply(interaction, "This button is no longer configured.");

    let opt = null;
    for (const row of msg.actionRows || []) {
      if (row.rowType === "button") {
        opt = row.options.find((o) => o.optId === optId);
        if (opt) break;
      }
    }
    if (!opt) return safeReply(interaction, "This button option is no longer configured.");
    await executeARAction(interaction, opt);
  } catch (err) {
    console.error("[AR] Button handler error:", err);
    await safeReply(interaction, "An error occurred processing your request.");
  }
}

async function handleMsgSelect(interaction) {
  try {
    const parts = interaction.customId.split(":");
    // msg:sel:{msgId}:{rowId}
    const msgId = parts[2];
    const rowId = parts[3];
    const msg = await ScheduledMessage.findById(msgId).catch(() => null);
    if (!msg) return safeReply(interaction, "This menu is no longer configured.");

    const row = (msg.actionRows || []).find((r) => r.rowId === rowId);
    if (!row) return safeReply(interaction, "This menu is no longer configured.");

    const selectedOptId = interaction.values[0];
    const opt = row.options.find((o) => o.optId === selectedOptId);
    if (!opt) return safeReply(interaction, "That option is no longer configured.");
    await executeARAction(interaction, opt);
  } catch (err) {
    console.error("[AR] Select handler error:", err);
    await safeReply(interaction, "An error occurred processing your request.");
  }
}

async function executeARAction(interaction, opt) {
  if (opt.action === "role") {
    const member = interaction.member ?? await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) return safeReply(interaction, "Could not find your member in this server.");
    const role = interaction.guild.roles.cache.get(opt.roleId);
    if (!role) return safeReply(interaction, "The configured role no longer exists.");
    const hasRole = member.roles.cache.has(opt.roleId);
    if (opt.toggleRole && hasRole) {
      await member.roles.remove(role);
      return safeReply(interaction, `✅ Removed the **${role.name}** role.`);
    } else if (!hasRole) {
      await member.roles.add(role);
      return safeReply(interaction, `✅ You now have the **${role.name}** role.`);
    } else {
      return safeReply(interaction, `You already have the **${role.name}** role.`);
    }
  } else if (opt.action === "message") {
    return safeReply(interaction, buildARResponsePayload(opt));
  } else if (opt.action === "dm") {
    try {
      await interaction.user.send(buildARResponsePayload(opt));
      return safeReply(interaction, "✅ You have been sent a DM!");
    } catch {
      return safeReply(interaction, "❌ Failed to send you a DM. Please check your privacy settings.");
    }
  }
}

function buildARResponsePayload(opt) {
  const content = String(opt?.content || "").trim() || "No message configured.";
  if (opt?.contentType === "embed") {
    return {
      embeds: [new EmbedBuilder().setColor(0x0f52ba).setDescription(content)],
    };
  }
  return { content };
}
