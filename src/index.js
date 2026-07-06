import { Client, GatewayIntentBits, REST, Routes, Events, MessageFlags, ChannelType } from 'discord.js';
import dotenv from 'dotenv';
import { data as submitCommand, execute as executeSubmit } from './commands/submit.js';
import { data as configureCommand, execute as executeConfigure } from './commands/configure.js';
import { data as pingCommand, execute as executePing } from './commands/ping.js';
import { handleInteraction } from './handlers/review.js';
import { connectDatabase, getGuildConfig } from './database.js';
import http from 'http';

dotenv.config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  console.error('Error: DISCORD_TOKEN and CLIENT_ID must be set in your .env file.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
  presence: { status: 'idle' }
});

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  // Establish database connection
  await connectDatabase();

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    const commands = [submitCommand.toJSON(), configureCommand.toJSON(), pingCommand.toJSON()];

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

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      if (interaction.commandName === 'submit') {
        const focusedValue = interaction.options.getFocused();
        const config = await getGuildConfig(interaction.guildId);
        if (!config || !config.publicChannelId) {
          return interaction.respond([]);
        }
        const channel = await interaction.guild.channels.fetch(config.publicChannelId).catch(() => null);
        if (channel && channel.type === ChannelType.GuildForum) {
          const tags = channel.availableTags || [];
          const filtered = tags.filter(tag => tag.name.toLowerCase().includes(focusedValue.toLowerCase()));
          return interaction.respond(
            filtered.slice(0, 25).map(tag => ({ name: tag.name, value: tag.id }))
          );
        }
      }
      return interaction.respond([]);
    }

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'submit') {
        await executeSubmit(interaction);
      } else if (interaction.commandName === 'configure') {
        await executeConfigure(interaction);
      } else if (interaction.commandName === 'ping') {
        await executePing(interaction);
      }
      return;
    }

    await handleInteraction(interaction);

  } catch (error) {
    console.error('Error handling interaction:', error);
    
    if (interaction.isRepliable() || interaction.deferred) {
      const msg = { content: 'An error occurred while executing this action.', flags: MessageFlags.Ephemeral };
      if (interaction.deferred) {
        await interaction.followUp(msg);
      } else {
        await interaction.reply(msg);
      }
    }
  }
});

client.login(token);

// Keep-alive HTTP server to prevent hibernation
const port = process.env.SERVER_PORT || process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Oasis Bot is online!\n');
}).listen(port, '0.0.0.0', () => {
  console.log(`Keep-alive web server is running on port ${port}`);
});
