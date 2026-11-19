import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { listResources } from '../database.js';
import { searchView, notice } from '../ui.js';
import { linksOf } from '../links.js';
import { bannerFile } from '../banner.js';

export const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription('Search the resources published in this server')
  .setContexts(0)
  .addStringOption(option => option
    .setName('query')
    .setDescription('Words to look for in titles, descriptions and tags (use * to list everything)')
    .setMaxLength(100))
  .addStringOption(option => option
    .setName('tags')
    .setDescription('Only resources with all of these tags, separated by commas')
    .setMaxLength(60)
    .setAutocomplete(true));

export function matches(resources, query) {
  if (query.trim() === '*') return resources;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const ranked = [];
  for (const r of resources) {
    const haystack = [r.title, r.description, ...(r.tags ?? []), ...linksOf(r), ...(r.files ?? []).map(f => f.name)].join(' ').toLowerCase();
    const hits = terms.map(term => haystack.includes(term));
    const count = hits.filter(Boolean).length;
    if (count) ranked.push({ r, hits, count });
  }
  const firstHit = (hits) => hits.findIndex(Boolean);
  return ranked
    .sort((a, b) => b.count - a.count || firstHit(a.hits) - firstHit(b.hits))
    .map(x => x.r);
}

export const parseTags = (value) => [...new Set(String(value ?? '').split(',').map(t => t.replace(/\|/g, '').trim()).filter(Boolean))];

export function filterTags(resources, tags) {
  const wanted = tags.map(t => t.toLowerCase());
  return resources.filter(r => wanted.every(t => (r.tags ?? []).some(x => x.toLowerCase() === t)));
}

export async function render(guild, query, tags, page) {
  const resources = filterTags(await listResources(guild.id), tags);
  return searchView({
    serverName: guild.name,
    serverIcon: guild.iconURL({ extension: 'png', size: 256 }),
    query,
    tags,
    results: matches(resources, query),
    page
  });
}

export async function execute(interaction) {
  if (!interaction.guild) {
    await interaction.reply({ ...notice('This command can only be used in a server.'), flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
    return;
  }
  const query = (interaction.options.getString('query') ?? '').trim();
  const tags = parseTags(interaction.options.getString('tags'));
  if (!query && !tags.length) {
    await interaction.reply({ ...notice('Give a `query`, some `tags`, or `*` to list everything.'), flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
    return;
  }
  await interaction.deferReply();
  const view = await render(interaction.guild, query || '*', tags, 0);
  await interaction.editReply({ flags: view.flags, components: view.components, files: [bannerFile()] });
}

export async function paginate(interaction) {
  const [, page, tags, ...rest] = interaction.customId.split('|');
  const view = await render(interaction.guild, rest.join('|'), parseTags(tags), Number(page) || 0);
  await interaction.update({ flags: view.flags, components: view.components });
}
