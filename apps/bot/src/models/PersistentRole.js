const mongoose = require("mongoose");

const persistentRoleSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    roleId: { type: String, required: true, index: true },
    assignedById: { type: String, default: null },
    reason: { type: String, default: "No reason provided." },
  },
  {
    timestamps: true,
  }
);

persistentRoleSchema.index({ guildId: 1, userId: 1, roleId: 1 }, { unique: true });

const PersistentRole =
  mongoose.models.PersistentRole ||
  mongoose.model("PersistentRole", persistentRoleSchema);

module.exports = {
  PersistentRole,
};
