import { ChannelType } from 'discord.js';
import { listResources, recordPublished } from './database.js';

const MAX_POSTS = 1000;

export function parsePost(message, tags = []) {
  const embed = message.embeds?.[0];
  if (!embed || embed.footer?.text !== 'Published via Oasis' || !embed.title) return null;
  const field = (name) => embed.fields?.find(f => f.name === name)?.value;
  const link = field('Link')?.match(/\]\((.+)\)$/)?.[1] ?? embed.url;
  const files = (embed.fields ?? [])
    .filter(f => /^Attachment \d+/.test(f.name))
    .map(f => f.value.match(/^\[Download (.+)\]\((.+)\)$/))
    .filter(Boolean)
    .map(m => ({ name: m[1], url: m[2], size: 0 }));
  if (!link && embed.image?.url) files.push({ name: decodeURIComponent(embed.image.url.split('?')[0].split('/').pop()), url: embed.image.url, size: 0 });
  if (!link && !files.length) return null;
  return {
    type: link ? 'link' : 'file',
    title: embed.title,
    description: embed.description ?? '',
    tags,
    submitterId: field('Contributor')?.match(/\d+/)?.[0] ?? null,
    ...(link ? { url: link } : { files }),
    publishedAt: embed.timestamp ?? message.createdAt
  };
}

// forum posts are threads; a text channel is read through its history
async function posts(channel) {
  const out = [];
  if (channel.type === ChannelType.GuildForum) {
    const names = new Map(channel.availableTags.map(t => [t.id, t.name]));
    const threads = [...(await channel.threads.fetchActive()).threads.values()];
    for (let before; threads.length < MAX_POSTS;) {
      const page = await channel.threads.fetchArchived({ type: 'public', limit: 100, before });
      threads.push(...page.threads.values());
      if (!page.hasMore || !page.threads.size) break;
      before = page.threads.last().id;
    }
    for (const thread of threads.slice(0, MAX_POSTS)) {
      const starter = await thread.fetchStarterMessage().catch(() => null);
      if (starter) out.push({ message: starter, url: thread.url, threadId: thread.id, tags: (thread.appliedTags ?? []).map(id => names.get(id)).filter(Boolean) });
    }
    return out;
  }
  for (let before; out.length < MAX_POSTS;) {
    const page = await channel.messages.fetch({ limit: 100, before });
    if (!page.size) break;
    page.forEach(m => out.push({ message: m, url: m.url, threadId: null, tags: [] }));
    before = page.last().id;
  }
  return out;
}

export async function backfill(channel, guildId, botId) {
  const known = new Set((await listResources(guildId)).map(r => r.publishedUrl));
  let added = 0;
  let skipped = 0;
  for (const { message, url, threadId, tags } of await posts(channel)) {
    if (message.author?.id !== botId) continue;
    if (known.has(url)) { skipped++; continue; }
    const post = parsePost(message, tags);
    if (!post) continue;
    if (await recordPublished(`post:${message.id}`, { ...post, guildId, publishedUrl: url, post: { channelId: channel.id, threadId, messageId: message.id, v2: false }, doneAt: new Date(post.publishedAt) })) added++;
  }
  return { added, skipped };
}
