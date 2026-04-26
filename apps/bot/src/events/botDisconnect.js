const { HealthStatus } = require("../models/HealthStatus");

module.exports = {
  name: "shardDisconnect",
  async execute(client) {
    const FLYNN_SUPPORT_GUILD_ID = process.env.FLYNN_SUPPORT_GUILD_ID || "1272158852606324766";
    const FLYNN_SUPPORT_CHANNEL_ID = "1272158892318785577";

    try {
      // Update health status to offline
      let healthDoc = await HealthStatus.findOne({ guildId: FLYNN_SUPPORT_GUILD_ID });
      if (!healthDoc) {
        healthDoc = await HealthStatus.create({
          guildId: FLYNN_SUPPORT_GUILD_ID,
          channelId: FLYNN_SUPPORT_CHANNEL_ID,
          botStatus: "offline",
          websiteStatus: "online",
        });
      }

      const wasOnline = healthDoc.botStatus === "online";
      healthDoc.botStatus = "offline";
      healthDoc.lastBotStatusChange = new Date();
      await healthDoc.save();

      console.log("[HealthCheck] Bot went offline (shardDisconnect)");

      // If bot was previously online, try to send status update before full disconnect
      if (wasOnline) {
        try {
          const channel =
            client.channels.cache.get(FLYNN_SUPPORT_CHANNEL_ID) ||
            (await client.channels.fetch(FLYNN_SUPPORT_CHANNEL_ID).catch(() => null));

          if (channel && channel.isTextBased()) {
            const SAPPHIRE = 0x0f52ba;
            const embed = {
              color: SAPPHIRE,
              title: "Flynn Bot & Website Status",
              fields: [
                {
                  name: "Discord Bot",
                  value: "⚠️ Offline",
                  inline: true,
                },
                {
                  name: "Website",
                  value: healthDoc.websiteStatus === "online" ? "✅ Online" : "❌ Offline",
                  inline: true,
                },
              ],
              footer: {
                text: "Health Check Monitor",
              },
              timestamp: new Date(),
            };

            if (healthDoc.messageId) {
              try {
                const msg = await channel.messages.fetch(healthDoc.messageId).catch(() => null);
                if (msg) {
                  await msg.edit({ embeds: [embed] }).catch(() => {});
                }
              } catch (error) {
                console.warn(`[HealthCheck] Failed to update message on disconnect: ${error.message}`);
              }
            } else {
              const sent = await channel.send({ embeds: [embed] }).catch(() => null);
              if (sent) {
                healthDoc.messageId = sent.id;
                await healthDoc.save().catch(() => {});
              }
            }
          }
        } catch (error) {
          console.warn(`[HealthCheck] Error posting disconnect message: ${error.message}`);
        }
      }
    } catch (error) {
      console.error(`[HealthCheck] Error on shardDisconnect: ${error.message}`);
    }
  },
};
