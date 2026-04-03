const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { sendModLog } = require("../../utils/modLog");
const Moderation = require("../../database/schemas/Moderation");
const { getGuildSettings } = require("../../utils/guildSettings");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("clear")
        .setDescription("Delete messages from the channel")
        .addIntegerOption(option =>
            option.setName("amount")
                  .setDescription("Number of messages to delete (1-100)")
                  .setRequired(true)
                  .setMinValue(1)
                  .setMaxValue(100)
        )
        .addStringOption(option =>
            option.setName("reason")
                  .setDescription("Reason for clearing messages")
                  .setRequired(false)
        ),

    async execute({ interaction, client }) {
        const settings = await getGuildSettings(interaction.guild.id);
        const modRoleId = settings.modRoleId;
        if (!modRoleId || !interaction.member.roles.cache.has(modRoleId)) {
            return interaction.reply({ content: "You do not have permission to use this command.", flags: MessageFlags.Ephemeral });
        }

        const amount = interaction.options.getInteger("amount");
        const reason = interaction.options.getString("reason") || "No reason provided";

        try {
            const messages = await interaction.channel.bulkDelete(amount, true);

            await sendModLog({
                client: interaction.client,
                guild: interaction.guild,
                action: "Cleared Messages",
                moderator: interaction.user,
                reason,
                extra: `Deleted ${messages.size} messages in #${interaction.channel.name}`
            });

            await Moderation.create({
                guildId: interaction.guild.id,
                userId: null, // no specific user
                moderatorId: interaction.user.id,
                action: "clear",
                reason,
                extra: `Deleted ${messages.size} messages in #${interaction.channel.name}`
            });

            interaction.reply({ content: `✅ Deleted ${messages.size} messages.`, flags: MessageFlags.Ephemeral });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "❌ I couldn't delete messages. They might be older than 2 weeks.", flags: MessageFlags.Ephemeral });
        }
    }
};