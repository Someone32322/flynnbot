const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const SAPPHIRE_COLOR = 0x0f52ba;
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://flynnbot-dashboard.onrender.com';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Learn about FlynnBot and how to enable commands for your server.'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('**Overview**')
      .setColor(SAPPHIRE_COLOR)
      .setDescription(
        `Commands are enabled per-server via the dashboard. Head there to configure which commands are available in this server, set up role restrictions, custom prefixes, and more.\n\n` +
        `> **Dashboard:** [https://flynnbot-dashboard.onrender.com](${DASHBOARD_URL})\n` +
        `> **Getting started:** Log in with Discord, select your server, then enable any commands you want.\n\n` +
        `> **Support:** If you have any questions or need help, join our [support server](https://discord.gg/v6VjBw9ShP).\n` +
        `> **Website:** [website](https://flynn.xyz)\n` +
        `> **Dashboard:** [dashboard](${DASHBOARD_URL})`
      )
      .setFooter({ text: 'FlynnBot • /help is the only global command — all others are enabled via the dashboard.' });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
