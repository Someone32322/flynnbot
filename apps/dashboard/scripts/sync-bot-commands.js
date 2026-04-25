/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../..');
const botCommandsDir = process.env.BOT_COMMANDS_DIR
  ? path.resolve(process.env.BOT_COMMANDS_DIR)
  : path.join(repoRoot, 'apps', 'bot', 'src', 'commands');

const outPath = path.join(__dirname, '..', 'src', 'commands', 'manifest.json');

function walkJsFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkJsFiles(full));
    if (entry.isFile() && entry.name.endsWith('.js') && entry.name !== 'meta.js') files.push(full);
  }
  return files;
}

function main() {
  if (!fs.existsSync(botCommandsDir)) {
    console.error(`[sync-bot-commands] Bot commands folder not found: ${botCommandsDir}`);
    process.exit(1);
  }

  const metaPath = path.join(botCommandsDir, 'meta.js');
  if (!fs.existsSync(metaPath)) {
    console.error(`[sync-bot-commands] meta.js not found at: ${metaPath}`);
    process.exit(1);
  }

  delete require.cache[require.resolve(metaPath)];
  const meta = require(metaPath);

  const commandData = {};
  for (const file of walkJsFiles(botCommandsDir)) {
    delete require.cache[require.resolve(file)];
    const cmd = require(file);
    if (cmd?.data?.name && typeof cmd.data.toJSON === 'function') {
      commandData[cmd.data.name] = cmd.data.toJSON();
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: botCommandsDir,
        meta,
        commandData,
      },
      null,
      2
    ) + '\n'
  );

  console.log(`[sync-bot-commands] Wrote ${outPath}`);
  console.log(`[sync-bot-commands] Commands: ${Object.keys(commandData).length}`);
}

main();
