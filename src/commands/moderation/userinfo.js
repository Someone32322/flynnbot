const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const Moderation = require("../../database/schemas/Moderation");
const { getGuildSettings } = require("../../utils/guildSettings");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("userinfo")
        .setDescription("View a user's moderation history")
        .addUserOption(option =>
            option.setName("user")
                  .setDescription("User to check")
                  .setRequired(true)
        ),

    async execute({ interaction, client }) {
        const settings = await getGuildSettings(interaction.guild.id);
        const modRoleId = settings.modRoleId;
        if (!modRoleId || !interaction.member.roles.cache.has(modRoleId)) {
            return interaction.reply({ content: "You do not have permission to use this command.", flags: MessageFlags.Ephemeral });
        }

        const user = interaction.options.getUser("user");

        // Fetch moderation history
        const history = await Moderation.find({ guildId: interaction.guild.id, userId: user.id }).sort({ timestamp: -1 });

        if (history.length === 0) {
            return interaction.reply({ content: `${user.tag} has no moderation history.`, flags: MessageFlags.Ephemeral });
        }

        // Count actions
        const warns = history.filter(h => h.action === "warn").length;
        const kicks = history.filter(h => h.action === "kick").length;
        const bans = history.filter(h => h.action === "ban").length;

        // Create embed
        const embed = new EmbedBuilder()
            .setTitle(`Moderation History for ${user.tag}`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .setColor("#0099ff")
            .addFields(
                { name: "Total Warnings", value: warns.toString(), inline: true },
                { name: "Total Kicks", value: kicks.toString(), inline: true },
                { name: "Total Bans", value: bans.toString(), inline: true }
            )
            .setTimestamp();

        // Add recent actions (last 10)
        const recent = history.slice(0, 10);
        if (recent.length > 0) {
            const actionsList = recent.map(h => {
                const mod = interaction.guild.members.cache.get(h.moderatorId)?.user?.tag || "Unknown";
                return `**${h.action.toUpperCase()}** - ${h.reason} (by ${mod} on <t:${Math.floor(h.timestamp.getTime() / 1000)}:F>)`;
            }).join("\n");

            embed.addFields({ name: "Recent Actions", value: actionsList, inline: false });
        }

        interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
};