const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require("discord.js");
const GuildSettings = require("../../database/schemas/GuildSettings");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("setmodrole")
        .setDescription("Set the moderator role for this server")
        .addRoleOption(option =>
            option.setName("role")
                  .setDescription("Role that can use moderation commands")
                  .setRequired(true)
        ),

    async execute({ interaction, client }) {
        if (interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({ content: "Only the server owner can use this command.", flags: MessageFlags.Ephemeral });
        }

        const role = interaction.options.getRole("role");

        try {
            await GuildSettings.findOneAndUpdate(
                { guildId: interaction.guild.id },
                { modRoleId: role.id },
                { upsert: true, returnDocument: 'after' }
            );

            interaction.reply({ content: `✅ Moderator role set to ${role}.`, flags: MessageFlags.Ephemeral });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "❌ Failed to set moderator role.", flags: MessageFlags.Ephemeral });
        }
    }
};