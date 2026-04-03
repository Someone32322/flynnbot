const { EmbedBuilder } = require("discord.js");
const { getGuildSettings } = require("./guildSettings");

/**
 * Sends a moderation log embed to the mod log channel
 * @param {Object} params
 * @param {import("discord.js").Client} params.client - Discord client
 * @param {import("discord.js").Guild} params.guild - Guild where action happened
 * @param {string} params.action - "Warned", "Kicked", "Banned", etc.
 * @param {import("discord.js").User} [params.user] - Target user (optional for actions like clear)
 * @param {import("discord.js").User} params.moderator - Moderator user
 * @param {string} params.reason - Reason for action
 * @param {string} [params.extra] - Extra info
 */
async function sendModLog({ client, guild, action, user, moderator, reason, extra }) {
    const settings = await getGuildSettings(guild.id);
    const logChannelId = settings.modLogChannelId;
    if (!logChannelId) return;

    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel) return;

    let color;
    switch (action) {
        case "Warned":
            color = "#ffff00";
            break;
        case "Kicked":
            color = "#ff9900";
            break;
        case "Banned":
            color = "#ff0000";
            break;
        case "Unbanned":
        case "Unmuted":
            color = "#00ff00";
            break;
        case "Muted":
            color = "#ff6600";
            break;
        case "Cleared Messages":
            color = "#666666";
            break;
        default:
            color = "#f05902";
    }

    const embed = new EmbedBuilder()
        .setTitle(user ? `${action} User` : action)
        .setColor(color)
        .setThumbnail(user ? user.displayAvatarURL({ dynamic: true }) : null)
        .addFields(
            user ? { name: "User", value: `${user.tag} (<@${user.id}>)`, inline: true } : { name: "Channel", value: `<#${logChannel.id}>`, inline: true },
            { name: "Moderator", value: `${moderator.tag} (<@${moderator.id}>)`, inline: true },
            { name: "Reason", value: reason, inline: false }
        )
        .setTimestamp();

    if (extra) embed.addFields({ name: "Extra", value: extra, inline: false });

    logChannel.send({ embeds: [embed] });
}

module.exports = { sendModLog };