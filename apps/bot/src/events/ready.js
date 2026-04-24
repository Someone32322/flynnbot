const { ActivityType } = require("discord.js");
const { prunePaginationSessions } = require("../lib/pagination");
const { startScheduler } = require("../lib/scheduler");
const { setupLogging } = require("../lib/logging");

module.exports = {
  name: "clientReady",
  once: true,
  execute(client) {
    console.log(`Ready event fired for ${client.user.tag}`);
    startScheduler(client);
    setupLogging(client);

    const rotatingStatuses = [
      { name: "tickets", type: ActivityType.Watching },
      { name: "slash commands", type: ActivityType.Watching },
      { name: "server configs", type: ActivityType.Listening },
      { name: "in the olympics", type: ActivityType.Competing },
    ];

    let index = 0;
    const applyStatus = () => {
      const next = rotatingStatuses[index % rotatingStatuses.length];
      client.user.setPresence({
        status: "dnd",
        activities: [next],
      });
      index += 1;
    };

    applyStatus();
    const timer = setInterval(applyStatus, 45_000);
    timer.unref();

    const pruneTimer = setInterval(() => prunePaginationSessions(client), 5 * 60 * 1000);
    pruneTimer.unref();
  },
};
