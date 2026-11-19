import { listResources, listBookmarks } from './database.js';

const clip = (value, max) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

export async function handleAutocomplete(interaction) {
  const guildId = interaction.guildId;
  const focused = interaction.options.getFocused(true);
  const typed = String(focused.value ?? '');
  if (!guildId) return interaction.respond([]);

  if (focused.name === 'tags') {
    const parts = typed.split(',');
    const current = parts.pop().trim().toLowerCase();
    const chosen = parts.map(t => t.trim()).filter(Boolean);
    const used = new Set(chosen.map(t => t.toLowerCase()));
    const counts = new Map();
    for (const r of await listResources(guildId)) {
      for (const tag of r.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    const prefix = chosen.length ? `${chosen.join(', ')}, ` : '';
    const options = [...counts.entries()]
      .filter(([tag]) => !used.has(tag.toLowerCase()) && tag.toLowerCase().includes(current))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 25)
      .map(([tag, n]) => ({ name: clip(`${prefix}${tag} (${n})`, 100), value: clip(`${prefix}${tag}`, 60) }));
    return interaction.respond(options);
  }

  if (focused.name === 'resource') {
    const word = typed.toLowerCase().replace(/^#/, '');
    let pool = await listResources(guildId);
    if (interaction.commandName === 'bookmark' && interaction.options.getSubcommand(false) === 'remove') {
      const saved = new Set((await listBookmarks(guildId, interaction.user.id)).map(b => b.resourceId));
      pool = pool.filter(r => saved.has(r._id));
    }
    const options = pool
      .filter(r => `${r.number ?? ''} ${r.title} ${(r.tags ?? []).join(' ')}`.toLowerCase().includes(word))
      .slice(0, 25)
      .map(r => ({ name: clip(`${r.number ? `#${r.number} ` : ''}${r.title ?? 'Untitled'}`, 100), value: String(r._id).slice(0, 100) }));
    return interaction.respond(options);
  }

  return interaction.respond([]);
}
