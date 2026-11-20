import { SlashCommandBuilder } from 'discord.js';
import { pingView } from '../ui.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check the bot latency and responsiveness');

export async function execute(interaction) {
  const latency = Date.now() - interaction.createdTimestamp;
  const apiLatency = Math.round(interaction.client.ws.ping);

  await interaction.reply(pingView(latency, apiLatency));
}
