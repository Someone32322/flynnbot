const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../database/schemas/User");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("transfer")
        .setDescription("Transfer coins to another user")
        .addUserOption(option =>
            option.setName("user")
                  .setDescription("User to transfer to")
                  .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName("amount")
                  .setDescription("Amount to transfer")
                  .setRequired(true)
                  .setMinValue(1)
        ),

    async execute({ interaction, client }) {
        const targetUser = interaction.options.getUser("user");
        const amount = interaction.options.getInteger("amount");

        if (targetUser.id === interaction.user.id) {
            return interaction.reply({ content: "You can't transfer coins to yourself.", ephemeral: true });
        }

        if (targetUser.bot) {
            return interaction.reply({ content: "You can't transfer coins to bots.", ephemeral: true });
        }

        let sender = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
        if (!sender) {
            sender = await User.create({ userId: interaction.user.id, guildId: interaction.guild.id });
        }

        if (sender.balance < amount) {
            return interaction.reply({ content: "You don't have enough coins to transfer that amount.", ephemeral: true });
        }

        let receiver = await User.findOne({ userId: targetUser.id, guildId: interaction.guild.id });
        if (!receiver) {
            receiver = await User.create({ userId: targetUser.id, guildId: interaction.guild.id });
        }

        sender.balance -= amount;
        receiver.balance += amount;

        await sender.save();
        await receiver.save();

        const embed = new EmbedBuilder()
            .setTitle("Transfer Successful")
            .setDescription(`You transferred ${amount} coins to ${targetUser.username}.`)
            .setColor("#00ff00")
            .setTimestamp();

        interaction.reply({ embeds: [embed] });
    }
};