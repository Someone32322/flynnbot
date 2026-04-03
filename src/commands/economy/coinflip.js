const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../database/schemas/User");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("coinflip")
        .setDescription("Flip a coin and bet on the outcome")
        .addStringOption(option =>
            option.setName("choice")
                  .setDescription("Heads or Tails")
                  .setRequired(true)
                  .addChoices(
                      { name: "Heads", value: "heads" },
                      { name: "Tails", value: "tails" }
                  )
        )
        .addIntegerOption(option =>
            option.setName("amount")
                  .setDescription("Amount to bet")
                  .setRequired(true)
                  .setMinValue(1)
        ),

    async execute({ interaction, client }) {
        const choice = interaction.options.getString("choice");
        const amount = interaction.options.getInteger("amount");

        let user = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
        if (!user) {
            user = await User.create({ userId: interaction.user.id, guildId: interaction.guild.id });
        }

        if (user.balance < amount) {
            return interaction.reply({ content: "You don't have enough coins to bet that amount.", ephemeral: true });
        }

        const result = Math.random() < 0.5 ? "heads" : "tails";
        const win = choice === result;

        if (win) {
            user.balance += amount;
        } else {
            user.balance -= amount;
        }
        await user.save();

        const embed = new EmbedBuilder()
            .setTitle("Coin Flip")
            .setDescription(`You chose ${choice}.\nThe coin landed on ${result}.\n${win ? "You won!" : "You lost!"}`)
            .addFields(
                { name: "Bet Amount", value: `${amount} coins`, inline: true },
                { name: "New Balance", value: `${user.balance} coins`, inline: true }
            )
            .setColor(win ? "#00ff00" : "#ff0000")
            .setTimestamp();

        interaction.reply({ embeds: [embed] });
    }
};