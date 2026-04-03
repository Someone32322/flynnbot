const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const os = require("os");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("botstats")
        .setDescription("View bot statistics"),

    async execute({ interaction, client }) {
        const uptime = client.uptime;
        const uptimeString = formatUptime(uptime);

        // Memory usage
        const memUsage = process.memoryUsage();
        const memUsageMB = {
            rss: (memUsage.rss / 1024 / 1024).toFixed(2),
            heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(2),
            heapTotal: (memUsage.heapTotal / 1024 / 1024).toFixed(2)
        };

        // System info
        const systemUptime = os.uptime();
        const systemUptimeString = formatUptime(systemUptime * 1000);
        const cpuCount = os.cpus().length;
        const platform = os.platform();
        const arch = os.arch();
        const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
        const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
        const usedMem = (totalMem - freeMem).toFixed(2);

        // Bot stats
        const guildCount = client.guilds.cache.size;
        const userCount = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        const channelCount = client.channels.cache.size;
        const commandCount = client.commands ? client.commands.size : 0;

        // Node.js version
        const nodeVersion = process.version;

        // Ping
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        const ping = sent.createdTimestamp - interaction.createdTimestamp;

        const embed = new EmbedBuilder()
            .setTitle("🤖 Bot Statistics")
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setColor("#ff6b6b")
            .addFields(
                {
                    name: "⏱️ Uptime & Performance",
                    value: `**Bot Uptime:** ${uptimeString}\n**System Uptime:** ${systemUptimeString}\n**Ping:** ${ping}ms\n**WebSocket Ping:** ${client.ws.ping}ms`,
                    inline: true
                },
                {
                    name: "💾 Memory Usage",
                    value: `**RSS:** ${memUsageMB.rss} MB\n**Heap Used:** ${memUsageMB.heapUsed} MB\n**Heap Total:** ${memUsageMB.heapTotal} MB\n**System Used:** ${usedMem}/${totalMem} GB`,
                    inline: true
                },
                {
                    name: "📊 Bot Info",
                    value: `**Servers:** ${guildCount}\n**Users:** ${userCount.toLocaleString()}\n**Channels:** ${channelCount}\n**Commands:** ${commandCount}`,
                    inline: true
                },
                {
                    name: "💻 System Info",
                    value: `**Platform:** ${platform}\n**Architecture:** ${arch}\n**CPU Cores:** ${cpuCount}\n**Node.js:** ${nodeVersion}`,
                    inline: true
                }
            )
            .setFooter({ text: `Bot ID: ${client.user.id}` })
            .setTimestamp();

        interaction.editReply({ content: null, embeds: [embed] });
    }
};

function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours % 24 > 0) parts.push(`${hours % 24}h`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
    if (seconds % 60 > 0) parts.push(`${seconds % 60}s`);

    return parts.join(' ') || '0s';
}