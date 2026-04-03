const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { sendModLog } = require("../../utils/modLog");
const Moderation = require("../../database/schemas/Moderation");
const { getGuildSettings } = require("../../utils/guildSettings");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Ban a user from the server")
        .addUserOption(option => 
            option.setName("user")
                  .setDescription("User to ban")
                  .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                  .setDescription("Reason for the ban")
                  .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName("days")
                  .setDescription("Number of days of messages to delete (0-7)")
                  .setRequired(false)
        ),

    async execute({ interaction, client }) {
        const settings = await getGuildSettings(interaction.guild.id);
        const modRoleId = settings.modRoleId;
        if (!modRoleId || !interaction.member.roles.cache.has(modRoleId)) {
            return interaction.reply({ content: "You do not have permission to use this command.", flags: MessageFlags.Ephemeral });
        }

        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason");
        const days = interaction.options.getInteger("days") || 0;
        const member = interaction.guild.members.cache.get(user.id);

        if (!member) return interaction.reply({ content: "User not found.", flags: MessageFlags.Ephemeral });

        try {
            await member.ban({ reason, deleteMessageDays: days });

            await sendModLog({
                client: interaction.client,
                guild: interaction.guild,
                action: "Banned",
                user,
                moderator: interaction.user,
                reason,
                extra: `Deleted Messages: ${days} days`
            });

            await Moderation.create({
                guildId: interaction.guild.id,
                userId: user.id,
                moderatorId: interaction.user.id,
                action: "ban",
                reason,
                extra: `Deleted Messages: ${days} days`
            });

            try {
                await user.send(`You have been banned from **${interaction.guild.name}** for: ${reason}\n\nIf you believe this was a mistake, please contact a moderator.`);
            } catch (error) {
                console.log(`Could not DM ${user.tag}: ${error.message}`);
            }

            interaction.reply({ content: `✅ ${user.tag} has been banned.`, flags: MessageFlags.Ephemeral });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "❌ I couldn't ban this user.", flags: MessageFlags.Ephemeral });
        }
    }
};