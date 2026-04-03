const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { sendModLog } = require("../../utils/modLog");
const Moderation = require("../../database/schemas/Moderation");
const { getGuildSettings } = require("../../utils/guildSettings");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Warn a user")
        .addUserOption(option => 
            option.setName("user")
                  .setDescription("User to warn")
                  .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                  .setDescription("Reason for the warning")
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

        // TODO: store warning in database

        await sendModLog({
            client: interaction.client,
            guild: interaction.guild,
            action: "Warned",
            user,
            moderator: interaction.user,
            reason
        });

        await Moderation.create({
            guildId: interaction.guild.id,
            userId: user.id,
            moderatorId: interaction.user.id,
            action: "warn",
            reason
        });

        try {
            await user.send(`You have received a warning in **${interaction.guild.name}** for: ${reason}\n\nIf you believe this was a mistake, please contact a moderator.`);
        } catch (error) {
            console.log(`Could not DM ${user.tag}: ${error.message}`);
        }

        interaction.reply({ content: `✅ ${user.tag} has been warned.`, flags: MessageFlags.Ephemeral });
    }
};