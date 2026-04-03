const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { sendModLog } = require("../../utils/modLog");
const Moderation = require("../../database/schemas/Moderation");
const { getGuildSettings } = require("../../utils/guildSettings");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("unban")
        .setDescription("Unban a user from the server")
        .addStringOption(option =>
            option.setName("userid")
                  .setDescription("User ID to unban")
                  .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                  .setDescription("Reason for the unban")
                  .setRequired(false)
        ),

    async execute({ interaction, client }) {
        const settings = await getGuildSettings(interaction.guild.id);
        const modRoleId = settings.modRoleId;
        if (!modRoleId || !interaction.member.roles.cache.has(modRoleId)) {
            return interaction.reply({ content: "You do not have permission to use this command.", flags: MessageFlags.Ephemeral });
        }

        const userId = interaction.options.getString("userid");
        const reason = interaction.options.getString("reason") || "No reason provided";

        try {
            await interaction.guild.bans.remove(userId, reason);

            const user = await client.users.fetch(userId);

            await sendModLog({
                client: interaction.client,
                guild: interaction.guild,
                action: "Unbanned",
                user,
                moderator: interaction.user,
                reason
            });

            await Moderation.create({
                guildId: interaction.guild.id,
                userId: user.id,
                moderatorId: interaction.user.id,
                action: "unban",
                reason
            });

            try {
                await user.send(`You have been unbanned from **${interaction.guild.name}** for: ${reason}`);
            } catch (error) {
                console.log(`Could not DM ${user.tag}: ${error.message}`);
            }

            interaction.reply({ content: `✅ ${user.tag} has been unbanned.`, flags: MessageFlags.Ephemeral });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "❌ I couldn't unban this user. Check the User ID.", flags: MessageFlags.Ephemeral });
        }
    }
};