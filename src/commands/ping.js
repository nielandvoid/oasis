import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check the bot latency and responsiveness');

export async function execute(interaction) {
  const sent = await interaction.deferReply({ fetchReply: true });
  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  const apiLatency = Math.round(interaction.client.ws.ping);

  const embed = new EmbedBuilder()
    .setTitle('🏓 Pong!')
    .setColor('#3498db')
    .addFields(
      { name: 'Bot Latency', value: `${latency}ms`, inline: true },
      { name: 'API Latency', value: `${apiLatency}ms`, inline: true }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
