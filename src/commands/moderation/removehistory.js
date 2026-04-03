const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const Moderation = require("../../database/schemas/Moderation");
const { getGuildSettings } = require("../../utils/guildSettings");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("removehistory")
        .setDescription("Remove moderation history for a user")
        .addUserOption(option =>
            option.setName("user")
                  .setDescription("User whose history to remove")
                  .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("action")
                  .setDescription("Specific action to remove (leave empty for all)")
                  .setRequired(false)
                  .addChoices(
                      { name: "Warn", value: "warn" },
                      { name: "Kick", value: "kick" },
                      { name: "Ban", value: "ban" },
                      { name: "Mute", value: "mute" },
                      { name: "Unban", value: "unban" },
                      { name: "Unmute", value: "unmute" },
                      { name: "Clear", value: "clear" },
                      { name: "All", value: "all" }
                  )
        ),

    async execute({ interaction, client }) {
        const settings = await getGuildSettings(interaction.guild.id);
        const modRoleId = settings.modRoleId;
        if (!modRoleId || !interaction.member.roles.cache.has(modRoleId)) {
            return interaction.reply({ content: "You do not have permission to use this command.", flags: MessageFlags.Ephemeral });
        }

        const user = interaction.options.getUser("user");
        const action = interaction.options.getString("action") || "all";

        const filter = { guildId: interaction.guild.id, userId: user.id };
        if (action !== "all") {
            filter.action = action;
        }

        try {
            const result = await Moderation.deleteMany(filter);

            const removedCount = result.deletedCount;
            const actionText = action === "all" ? "all actions" : action;

            interaction.reply({ 
                content: `✅ Removed ${removedCount} ${actionText} from ${user.tag}'s history.`, 
                flags: MessageFlags.Ephemeral 
            });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "❌ Failed to remove history.", flags: MessageFlags.Ephemeral });
        }
    }
};