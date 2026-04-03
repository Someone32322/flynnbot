const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { sendModLog } = require("../../utils/modLog");
const Moderation = require("../../database/schemas/Moderation");
const { getGuildSettings } = require("../../utils/guildSettings");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("unmute")
        .setDescription("Remove timeout from a user")
        .addUserOption(option =>
            option.setName("user")
                  .setDescription("User to unmute")
                  .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                  .setDescription("Reason for the unmute")
                  .setRequired(false)
        ),

    async execute({ interaction, client }) {
        const settings = await getGuildSettings(interaction.guild.id);
        const modRoleId = settings.modRoleId;
        if (!modRoleId || !interaction.member.roles.cache.has(modRoleId)) {
            return interaction.reply({ content: "You do not have permission to use this command.", flags: MessageFlags.Ephemeral });
        }

        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason") || "No reason provided";
        const member = interaction.guild.members.cache.get(user.id);

        if (!member) return interaction.reply({ content: "User not found.", flags: MessageFlags.Ephemeral });

        if (!member.isCommunicationDisabled()) {
            return interaction.reply({ content: "This user is not muted.", flags: MessageFlags.Ephemeral });
        }

        try {
            await member.timeout(null, reason);

            await sendModLog({
                client: interaction.client,
                guild: interaction.guild,
                action: "Unmuted",
                user,
                moderator: interaction.user,
                reason
            });

            await Moderation.create({
                guildId: interaction.guild.id,
                userId: user.id,
                moderatorId: interaction.user.id,
                action: "unmute",
                reason
            });

            try {
                await user.send(`You have been unmuted in **${interaction.guild.name}**. Reason: ${reason}`);
            } catch (error) {
                console.log(`Could not DM ${user.tag}: ${error.message}`);
            }

            interaction.reply({ content: `✅ ${user.tag} has been unmuted.`, flags: MessageFlags.Ephemeral });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "❌ I couldn't unmute this user.", flags: MessageFlags.Ephemeral });
        }
    }
};