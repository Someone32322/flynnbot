const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Profile = require("../../database/schemas/Profile");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("rep")
        .setDescription("Give reputation to users")
        .addUserOption(option =>
            option.setName("user")
                  .setDescription("User to give reputation to")
                  .setRequired(true))
        .addStringOption(option =>
            option.setName("reason")
                  .setDescription("Reason for giving reputation")
                  .setRequired(false)),

    async execute({ interaction, client }) {
        const targetUser = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason") || "No reason provided";

        if (targetUser.id === interaction.user.id) {
            return interaction.reply({ content: "You can't give reputation to yourself!", ephemeral: true });
        }

        if (targetUser.bot) {
            return interaction.reply({ content: "You can't give reputation to bots!", ephemeral: true });
        }

        // Check cooldown (once per day per user)
        const lastRepKey = `lastRep_${interaction.user.id}_${targetUser.id}`;
        const lastRep = client.lastReps?.get(lastRepKey);
        const now = Date.now();
        const cooldown = 24 * 60 * 60 * 1000; // 24 hours

        if (lastRep && now - lastRep < cooldown) {
            const remaining = Math.ceil((cooldown - (now - lastRep)) / (60 * 60 * 1000));
            return interaction.reply({ content: `You can give reputation to this user again in ${remaining} hours.`, ephemeral: true });
        }

        // Initialize client.lastReps if it doesn't exist
        if (!client.lastReps) client.lastReps = new Map();

        // Update target user's reputation
        let targetProfile = await Profile.findOne({ userId: targetUser.id });
        if (!targetProfile) {
            targetProfile = await Profile.create({ userId: targetUser.id });
        }

        targetProfile.reputation += 1;
        await targetProfile.save();

        // Set cooldown
        client.lastReps.set(lastRepKey, now);

        const embed = new EmbedBuilder()
            .setTitle("⭐ Reputation Given!")
            .setDescription(`${interaction.user} gave ${targetUser} a reputation point!\n\n**Reason:** ${reason}`)
            .addFields({ name: "New Reputation", value: `${targetProfile.reputation} ⭐`, inline: true })
            .setColor("#ffd700")
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 128 }))
            .setTimestamp();

        interaction.reply({ embeds: [embed] });
    }
};