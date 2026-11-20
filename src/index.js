import { Client, GatewayIntentBits, REST, Routes, Events, MessageFlags, ActivityType } from 'discord.js';
import dotenv from 'dotenv';
import { data as submitCommand, execute as executeSubmit } from './commands/submit.js';
import { data as configureCommand, execute as executeConfigure } from './commands/configure.js';
import { data as pingCommand, execute as executePing } from './commands/ping.js';
import { data as helpCommand, execute as executeHelp } from './commands/help.js';
import { data as searchCommand, execute as executeSearch, paginate as paginateSearch } from './commands/search.js';
import { data as leaderboardCommand, execute as executeLeaderboard } from './commands/leaderboard.js';
import { data as mySubmissionsCommand, execute as executeMySubmissions, paginate as paginateMySubmissions } from './commands/mysubmissions.js';
import { data as bookmarkCommand, execute as executeBookmark, paginate as paginateBookmarks, toggle as toggleBookmark } from './commands/bookmark.js';
import { data as resourceCommand, execute as executeResource, handleUnpublish } from './commands/resource.js';
import { handleAutocomplete } from './autocomplete.js';
import { handleInteraction } from './handlers/review.js';
import { connectDatabase } from './database.js';
import http from 'http';

dotenv.config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  console.error('Error: DISCORD_TOKEN and CLIENT_ID must be set in your .env file.');
  process.exit(1);
}

const client = new Client({
  // user text never pings; the reviewer ping opts in per message
  allowedMentions: { parse: [], repliedUser: false },
  intents: [GatewayIntentBits.Guilds],
  presence: {
    status: 'idle',
    activities: [{
      type: ActivityType.Custom,
      name: 'custom',
      state: 'resourcing...'
    }]
  }
});

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  await connectDatabase();

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    const commands = [
      submitCommand.toJSON(),
      configureCommand.toJSON(),
      pingCommand.toJSON(),
      helpCommand.toJSON(),
      searchCommand.toJSON(),
      leaderboardCommand.toJSON(),
      mySubmissionsCommand.toJSON(),
      bookmarkCommand.toJSON(),
      resourceCommand.toJSON()
    ];

    console.log('Registering global slash commands...');
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );
    console.log('Global slash commands registered successfully.');
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }
});

client.rest.on('rateLimited', (info) => console.warn(`discord rate limit: ${info.method} ${info.route} waits ${info.timeToReset}ms (global: ${info.global})`));
console.log(`node ${process.version}`);

const COMMAND_LIMIT_MS = 10000;

client.on('interactionCreate', async (interaction) => {
  const label = interaction.isChatInputCommand() ? `/${interaction.commandName}` : interaction.isButton() ? `button ${interaction.customId.split(/[:|]/)[0]}` : interaction.type;
  const started = Date.now();
  const timer = setTimeout(async () => {
    console.error(`${label} still running after ${COMMAND_LIMIT_MS / 1000}s (deferred: ${interaction.deferred}, replied: ${interaction.replied})`);
    if (interaction.isRepliable() && interaction.deferred && !interaction.replied) {
      await interaction.editReply({ content: 'That took too long. Try again in a moment.' }).catch(err => console.error(`${label} timeout notice failed:`, err.message));
    }
  }, COMMAND_LIMIT_MS);
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'submit') {
        await executeSubmit(interaction);
      } else if (interaction.commandName === 'configure') {
        await executeConfigure(interaction);
      } else if (interaction.commandName === 'ping') {
        await executePing(interaction);
      } else if (interaction.commandName === 'help') {
        await executeHelp(interaction);
      } else if (interaction.commandName === 'search') {
        await executeSearch(interaction);
      } else if (interaction.commandName === 'leaderboard') {
        await executeLeaderboard(interaction);
      } else if (interaction.commandName === 'mysubmissions') {
        await executeMySubmissions(interaction);
      } else if (interaction.commandName === 'bookmark') {
        await executeBookmark(interaction);
      } else if (interaction.commandName === 'resource') {
        await executeResource(interaction);
      }
      return;
    }

    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
      return;
    }

    if (interaction.isButton() && interaction.guild) {
      const id = interaction.customId;
      if (id.startsWith('search|')) return await paginateSearch(interaction);
      if (id.startsWith('mine|')) return await paginateMySubmissions(interaction);
      if (id.startsWith('bm|')) return await paginateBookmarks(interaction);
      if (id.startsWith('bookmark:')) return await toggleBookmark(interaction);
      if (id.startsWith('unpub:')) return await handleUnpublish(interaction);
    }

    await handleInteraction(interaction);
  } catch (error) {
    console.error(`${label} failed after ${Date.now() - started}ms:`, error);

    if (interaction.isRepliable()) {
      const msg = { content: 'An error occurred while executing this action.', flags: MessageFlags.Ephemeral };
      await (interaction.deferred || interaction.replied ? interaction.followUp(msg) : interaction.reply(msg)).catch(() => null);
    }
  } finally {
    clearTimeout(timer);
    if (Date.now() - started > 3000) console.log(`${label} finished in ${Date.now() - started}ms`);
  }
});

client.login(token);

const port = process.env.SERVER_PORT || process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Oasis is online!\n');
}).listen(port, '0.0.0.0', () => {
  console.log(`Keep-alive web server is running on port ${port}`);
});
