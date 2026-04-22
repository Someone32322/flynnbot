const DURATION_MULTIPLIERS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  y: 365 * 24 * 60 * 60 * 1000,
};

function parseDuration(input) {
  if (!input) {
    return null;
  }

  const value = `${input}`.trim().toLowerCase();
  const match = value.match(/^(\d+)([smhdy])$/);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  return amount * DURATION_MULTIPLIERS[unit];
}

function formatDuration(durationMs) {
  if (!durationMs) {
    return "Permanent";
  }

  const units = [
    ["year", DURATION_MULTIPLIERS.y],
    ["day", DURATION_MULTIPLIERS.d],
    ["hour", DURATION_MULTIPLIERS.h],
    ["minute", DURATION_MULTIPLIERS.m],
    ["second", DURATION_MULTIPLIERS.s],
  ];

  for (const [label, size] of units) {
    if (durationMs >= size && durationMs % size === 0) {
      const amount = durationMs / size;
      return `${amount} ${label}${amount === 1 ? "" : "s"}`;
    }
  }

  const seconds = Math.max(1, Math.round(durationMs / 1000));
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "Never";
  }

  return new Date(dateValue).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

module.exports = {
  parseDuration,
  formatDuration,
  formatDate,
};
