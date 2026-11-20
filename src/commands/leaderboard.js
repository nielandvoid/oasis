import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { listResources } from '../database.js';
import { leaderboardView, notice } from '../ui.js';
import { bannerFile } from '../banner.js';

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('See who has contributed the most resources to this server')
  .setContexts(0);

const TOP = 10;

export function rank(resources) {
  const by = new Map();
  for (const r of resources) {
    if (!r.submitterId) continue;
    const row = by.get(r.submitterId) ?? { id: r.submitterId, count: 0, latest: 0 };
    row.count++;
    row.latest = Math.max(row.latest, new Date(r.doneAt ?? 0).getTime());
    by.set(r.submitterId, row);
  }
  return [...by.values()].sort((a, b) => b.count - a.count || b.latest - a.latest);
}

export async function execute(interaction) {
  if (!interaction.guild) {
    await interaction.reply({ ...notice('This command can only be used in a server.'), flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
    return;
  }
  const resources = await listResources(interaction.guild.id);
  const all = rank(resources);
  const rows = all.slice(0, TOP);
  rows.fullCount = all.length;
  const at = all.findIndex(r => r.id === interaction.user.id);
  const view = leaderboardView({
    serverName: interaction.guild.name,
    serverIcon: interaction.guild.iconURL({ extension: 'png', size: 256 }),
    rows,
    total: resources.length,
    viewer: at >= 0 ? { rank: at + 1, count: all[at].count } : null
  });
  await interaction.reply({ ...view, files: [bannerFile()] });
}
