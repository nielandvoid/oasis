import { SlashCommandBuilder } from 'discord.js';
import { pingView } from '../ui.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check the bot latency and responsiveness');

export async function execute(interaction) {
  await interaction.deferReply();
  const sent = await interaction.fetchReply();
  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  const apiLatency = Math.round(interaction.client.ws.ping);

  await interaction.editReply(pingView(latency, apiLatency));
}
