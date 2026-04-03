const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const GuildSettings = require("../../database/schemas/GuildSettings");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("setsupportrole")
        .setDescription("Set the support role for tickets (Owner only)")
        .addRoleOption(option =>
            option.setName("role")
                  .setDescription("Role that can manage tickets")
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
                { supportRoleId: role.id },
                { upsert: true, returnDocument: 'after' }
            );

            interaction.reply({ content: `✅ Support role set to ${role}.`, flags: MessageFlags.Ephemeral });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "❌ Failed to set support role.", flags: MessageFlags.Ephemeral });
        }
    }
};