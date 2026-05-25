const commandEngine = require("../lib/commandEngine/hooks");

module.exports = {
  name: "voiceStateUpdate",
  async execute(oldState, newState, client) {
    if (!newState.guild && !oldState.guild) return;
    await commandEngine.onVoiceUpdate(oldState, newState).catch(() => {});
  },
};
