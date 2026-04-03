const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { sendModLog } = require("../../utils/modLog");
const Moderation = require("../../database/schemas/Moderation");
const { getGuildSettings } = require("../../utils/guildSettings");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("mute")
        .setDescription("Timeout a user")
        .addUserOption(option =>
            option.setName("user")
                  .setDescription("User to mute")
                  .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName("duration")
                  .setDescription("Duration in minutes (max 40320)")
                  .setRequired(true)
                  .setMinValue(1)
                  .setMaxValue(40320)
        )
        .addStringOption(option =>
            option.setName("reason")
                  .setDescription("Reason for the mute")
                  .setRequired(false)
        ),

    async execute({ interaction, client }) {
        const settings = await getGuildSettings(interaction.guild.id);
        const modRoleId = settings.modRoleId;
        if (!modRoleId || !interaction.member.roles.cache.has(modRoleId)) {
            return interaction.reply({ content: "You do not have permission to use this command.", flags: MessageFlags.Ephemeral });
        }

        const user = interaction.options.getUser("user");
        const duration = interaction.options.getInteger("duration");
        const reason = interaction.options.getString("reason") || "No reason provided";
        const member = interaction.guild.members.cache.get(user.id);

        if (!member) return interaction.reply({ content: "User not found.", flags: MessageFlags.Ephemeral });

        if (member.roles.highest.position >= interaction.member.roles.highest.position) {
            return interaction.reply({ content: "You cannot mute this user.", flags: MessageFlags.Ephemeral });
        }

        try {
            const timeoutDuration = duration * 60 * 1000; // minutes to ms
            await member.timeout(timeoutDuration, reason);

            await sendModLog({
                client: interaction.client,
                guild: interaction.guild,
                action: "Muted",
                user,
                moderator: interaction.user,
                reason,
                extra: `Duration: ${duration} minutes`
            });

            await Moderation.create({
                guildId: interaction.guild.id,
                userId: user.id,
                moderatorId: interaction.user.id,
                action: "mute",
                reason,
                extra: `Duration: ${duration} minutes`
            });

            try {
                await user.send(`You have been muted in **${interaction.guild.name}** for ${duration} minutes. Reason: ${reason}`);
            } catch (error) {
                console.log(`Could not DM ${user.tag}: ${error.message}`);
            }

            interaction.reply({ content: `✅ ${user.tag} has been muted for ${duration} minutes.`, flags: MessageFlags.Ephemeral });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: "❌ I couldn't mute this user.", flags: MessageFlags.Ephemeral });
        }
    }
};