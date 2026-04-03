const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { sendModLog } = require("../../utils/modLog");
const Moderation = require("../../database/schemas/Moderation");
const { getGuildSettings } = require("../../utils/guildSettings");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Kick a user from the server")
        .addUserOption(option => 
            option.setName("user")
                  .setDescription("User to kick")
                  .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                  .setDescription("Reason for the kick")
                  .setRequired(true)
        ),

    async execute({ interaction, client }) {
        const settings = await getGuildSettings(interaction.guild.id);
        const modRoleId = settings.modRoleId;
        if (!modRoleId || !interaction.member.roles.cache.has(modRoleId)) {
            return interaction.reply({ content: "You do not have permission to use this command.", flags: MessageFlags.Ephemeral });
        }

        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason");
        const member = interaction.guild.members.cache.get(user.id);

        if (!member) return interaction.reply({ content: "User not found.", flags: MessageFlags.Ephemeral });

        try {
            await member.kick(reason);

            await sendModLog({
                client: interaction.client,
                guild: interaction.guild,
                action: "Kicked",
                user,
                moderator: interaction.user,
                reason
            });

            await Moderation.create({
                guildId: interaction.guild.id,
                userId: user.id,
                moderatorId: interaction.user.id,
                action: "kick",
                reason
            });

            try {
                await user.send(`You have been kicked from **${interaction.guild.name}** for: ${reason}\n\nIf you believe this was a mistake, please contact a moderator.`);
            } catch (error) {
                console.log(`Could not DM ${user.tag}: ${error.message}`);
            }

            interaction.reply({ content: `✅ ${user.tag} has been kicked.`, flags: MessageFlags.Ephemeral });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "❌ I couldn't kick this user.", flags: MessageFlags.Ephemeral });
        }
    }
};