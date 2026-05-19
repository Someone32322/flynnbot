const { onVoiceStateUpdate } = require("../lib/workflow/hooks");

module.exports = {
  name: "voiceStateUpdate",
  async execute(oldState, newState, client) {
    if (!newState.guild && !oldState.guild) return;
    await onVoiceStateUpdate(oldState, newState).catch(() => {});
  },
};
