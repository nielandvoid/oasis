import {
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  FileBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} from 'discord.js';
import { linksOf } from './links.js';

export const COLORS = { neutral: 0xffffff, good: 0x7ee8a8, bad: 0xff8b9a, lavender: 0xc49bff };
export const V2 = MessageFlags.IsComponentsV2;
export const EPHEMERAL_V2 = MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;
export const BANNER = 'oasis_visual.png';

const text = (content) => new TextDisplayBuilder().setContent(String(content).slice(0, 3900));
const divider = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
const stamp = (date = Date.now()) => `<t:${Math.floor(new Date(date).getTime() / 1000)}:f>`;

export const escapeMd = (value) => String(value).replace(/[\\*_~|`>#[\]()]/g, '\\$&');
// backslash escapes show up literally inside link text, so only brackets are swapped out
const linkText = (value) => String(value).replace(/\[/g, '(').replace(/]/g, ')');
export const quote = (value) => String(value).split('\n').map(line => (line ? `> ${line}` : '>')).join('\n');
export const formatSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

function build(color, head, thumbnailUrl, banner = false) {
  const container = new ContainerBuilder().setAccentColor(color);
  if (banner) container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${BANNER}`)));
  if (thumbnailUrl) {
    container.addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(text(head))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl)));
  } else {
    container.addTextDisplayComponents(text(head));
  }
  return container;
}

const block = (container, content) => container.addSeparatorComponents(divider()).addTextDisplayComponents(text(content));
const footer = (container, content) => block(container, `-# ${content}`);
const linkButton = (label, url) => new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url));

const chips = (values) => values.map(v => `\`${String(v).replace(/`/g, "'")}\``).join(', ');
const duplicateLines = (dupes) => dupes.map(d => `${d.link ? `[${linkText(d.title)}](${d.link})` : escapeMd(d.title)} / ${d.status === 'approved' ? 'published' : 'pending review'}`).join('\n');
const idTag = (r) => (r.number ? ` \`ID:${r.number}\`` : '');
const linkLines = (r, bold = true) => {
  const urls = linksOf(r);
  const label = (name) => (bold ? `**${name}**` : name);
  return urls.length > 1 ? `${label('Links:')}\n${urls.map(u => `> - ${u}`).join('\n')}` : `${label('Link:')} ${urls[0] ?? ''}`;
};
const fileLines = (files) => files.map((f, i) => `**File ${i + 1}** / [${linkText(f.name)}](${f.url}) / ${formatSize(f.size)}`).join('\n');

export function notice(content, color = COLORS.neutral) {
  return { flags: V2, components: [new ContainerBuilder().setAccentColor(color).addTextDisplayComponents(text(content))] };
}

export function draftView({ draftId, type, title, url, urls, files }) {
  const container = build(COLORS.neutral, `## Draft: ${escapeMd(title)}\n-# add a description & specify tags to proceed (supports markdown & linebreaks)`);
  block(container, type === 'link' ? (linksOf({ url, urls }).length > 1 ? `**URLs:**\n${linksOf({ url, urls }).map(u => `> - ${u}`).join('\n')}` : `**URL**\n${url}`) : fileLines(files));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`write-desc:${type}:${draftId}`).setLabel('Write Description').setStyle(ButtonStyle.Primary)
  );
  return { flags: EPHEMERAL_V2, components: [container, row] };
}

export function reviewView(sub, { status = 'pending', by, reason, avatarUrl, attached = [], ping } = {}) {
  const color = status === 'approved' ? COLORS.good : status === 'rejected' ? COLORS.bad : COLORS.neutral;
  const heading = status === 'approved' ? 'Resource Approved' : status === 'rejected' ? 'Resource Rejected' : 'New Resource Submission';
  const line = status === 'approved' ? `approved and published by ${escapeMd(by)}`
    : status === 'rejected' ? `rejected by ${escapeMd(by)}`
    : `${sub.type} submission from <@${sub.submitterId}>`;
  const container = build(color, `## ${heading}\n-# ${line}`, status === 'pending' ? avatarUrl : null);
  if (status === 'pending' && ping) block(container, `<@&${ping}>`);
  block(container, `**Title:** ${escapeMd(sub.title)}`);
  block(container, `**Description:**\n${quote(sub.description)}`);
  if (sub.tags?.length) block(container, `**${sub.tags.length > 1 ? 'Selected-Tags' : 'Selected-Tag'}:** ${chips(sub.tags)}`);
  block(container, sub.type === 'link' ? linkLines(sub) : fileLines(sub.files));
  if (sub.duplicates?.length) block(container, `**Possible Duplicate${sub.duplicates.length > 1 ? 's' : ''}:**\n${duplicateLines(sub.duplicates)}`);
  if (status === 'pending' && attached.length) {
    container.addFileComponents(...attached.map(name => new FileBuilder().setURL(`attachment://${name}`)));
  }
  if (status === 'rejected' && reason) block(container, `**Rejection Reason:**\n${quote(reason)}`);
  footer(container, `Oasis / ${stamp()}`);

  const components = [container];
  if (status === 'pending') {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('approve').setLabel('Approve & Publish').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('reject').setLabel('Reject').setStyle(ButtonStyle.Danger)
    ));
  }
  return { flags: V2, components };
}

export function publicView(sub, { avatarUrl, images = [], attached = [], large = [], publishedAt, edited = false, bookmarkId } = {}) {
  const files = sub.files ?? [];
  const container = build(COLORS.lavender, [
    `## ${escapeMd(sub.title)}${idTag(sub)}`,
    `Contributor: <@${sub.submitterId}>`,
    '',
    `Published: ${stamp(publishedAt)}`
  ].join('\n'), avatarUrl);
  block(container, `Description:\n${quote(sub.description)}`);
  if (sub.tags?.length) block(container, `${sub.tags.length > 1 ? 'Tags' : 'Tag'}: ${chips(sub.tags)}`);
  if (sub.type === 'link') {
    block(container, linkLines(sub, false));
  } else {
    // a file too large to attach is linked right in the list
    block(container, `${files.map((f, i) => `File ${i + 1} / ${large.includes(f) ? `[${linkText(f.name)}](${f.url})` : escapeMd(f.name)} / ${formatSize(f.size)}`).join('\n')}`);
    if (images.length) {
      container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(...images.slice(0, 10).map(name => new MediaGalleryItemBuilder().setURL(`attachment://${name}`))));
    }
    if (attached.length) container.addFileComponents(...attached.map(name => new FileBuilder().setURL(`attachment://${name}`)));
  }
  footer(container, edited ? 'Published via Oasis / Edited' : 'Published via Oasis');
  const components = [container];
  if (bookmarkId) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bookmark:${bookmarkId}`).setLabel('Bookmark').setStyle(ButtonStyle.Primary)
    ));
  }
  return { flags: V2, components };
}

export function dmView(kind, { title, guildName, guildIconUrl, publishedUrl, urls = [], files = [], reason, duplicates = [] }) {
  if (kind === 'approved') {
    const container = build(COLORS.good, `## Resource Approved & Published!\n-# ${escapeMd(guildName)}`, guildIconUrl, true);
    block(container, `Your submission **"${escapeMd(title)}"** has been approved and published in **${escapeMd(guildName)}**!`);
    if (urls.length) block(container, linkLines({ urls }));
    if (files.length) block(container, fileLines(files));
    footer(container, `Oasis / ${stamp()}`);
    const components = [container];
    if (publishedUrl) components.push(linkButton('Go to Post', publishedUrl));
    return { flags: V2, components };
  }
  if (kind === 'duplicate') {
    const container = build(COLORS.neutral, `## Possible Duplicate\n-# ${escapeMd(guildName)}`, guildIconUrl, true);
    block(container, `Your submission **"${escapeMd(title)}"** in **${escapeMd(guildName)}** looks like a resource that already exists:\n${duplicateLines(duplicates)}`);
    block(container, 'It was still sent to the moderators, who will decide whether to publish it.');
    footer(container, `Oasis / ${stamp()}`);
    return { flags: V2, components: [container] };
  }
  const container = build(COLORS.bad, `## Resource Submission Update\n-# ${escapeMd(guildName)}`, guildIconUrl, true);
  block(container, `Your resource submission **"${escapeMd(title)}"** in **${escapeMd(guildName)}** was rejected by the moderators.`);
  block(container, `**Reason**\n${quote(reason)}`);
  footer(container, `Oasis / ${stamp()}`);
  return { flags: V2, components: [container] };
}

const COMMANDS = [
  ['<:files:1523716237748732005>', '/submit file', 'submit file attachments (up to 5 files at once) for moderator review. you will be prompted to add a description after uploading.'],
  ['<:link:1523716241662021743>', '/submit link', 'submit a URL or web link (up to 5 links at once) for moderator review. you will be prompted to add a description after entering the URL.'],
  ['<:configure:1523716239690698762>', '/configure', 'set up the review channel, public resources channel and reviewer role for this server. (requires **Manage Server**).'],
  ['', '/resource', 'edit or unpublish a published resource. (requires **Manage Messages**).'],
  ['', '/search', 'search every published resource by title, description or tag. use `*` to list them all.'],
  ['', '/mysubmissions', 'see the status of everything you have submitted here, including rejection reasons.'],
  ['', '/bookmark', 'save resources to your account: `add`, `remove` or `list` your bookmarks.'],
  ['', '/leaderboard', 'see the top contributors by number of published resources.'],
  ['<:pong:1523716243868221631>', '/ping', 'check the bot\'s websocket heartbeat and response latency.'],
  ['<:questionmark:1523716245952794848>', '/help', 'shows this list.']
];

export function helpView(avatarUrl) {
  const container = build(COLORS.neutral, '## Oasis 101\n-# commands and how to use them', avatarUrl, true);
  block(container, COMMANDS.map(([emoji, name, desc]) => `${emoji ? `${emoji} ` : ''}**\`${name}\`**\n${quote(desc)}`).join('\n\n'));
  footer(container, 'Oasis');
  return { flags: V2, components: [container] };
}

export function pingView(latency, apiLatency) {
  const container = build(COLORS.neutral, '## <:pong:1523716243868221631> Pong!');
  block(container, `${quote(`**Bot Latency:** ${latency}ms\n**API Latency:** ${apiLatency}ms`)}`);
  footer(container, stamp());
  return { flags: V2, components: [container] };
}

export function configView(config, guildIconUrl) {
  const container = build(COLORS.neutral, '## Oasis Configuration\n-# current server config', guildIconUrl);
  const channel = (id) => (id ? `<#${id}>` : 'not configured');
  block(container, quote(`**Review Channel:** ${channel(config?.reviewChannelId)}\n**Public Channel:** ${channel(config?.publicChannelId)}\n**Reviewer Role:** ${config?.reviewerRoleId ? `<@&${config.reviewerRoleId}>` : 'not configured'}`));
  footer(container, stamp());
  return { flags: EPHEMERAL_V2, components: [container] };
}

const clip = (value, max) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);
const SEARCH_PAGE_BUDGET = 3000;
const SEARCH_PER_PAGE = 6;

function pageEntries(entries) {
  const pages = [];
  let current = [];
  let size = 0;
  for (const entry of entries) {
    if (current.length && (current.length >= SEARCH_PER_PAGE || size + entry.length > SEARCH_PAGE_BUDGET)) {
      pages.push(current);
      current = [];
      size = 0;
    }
    current.push(entry);
    size += entry.length + 1;
  }
  if (current.length) pages.push(current);
  return pages;
}

function addPage(container, pages, at, label) {
  container.addSeparatorComponents(divider());
  pages[at].forEach((entry, i) => {
    if (i > 0) container.addSeparatorComponents(divider());
    container.addTextDisplayComponents(text(entry));
  });
  footer(container, pages.length > 1 ? `${label} / page ${at + 1}/${pages.length}` : label);
}

const navRow = (pages, at, id) => (pages.length > 1 ? [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(id(at - 1)).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(at === 0),
  new ButtonBuilder().setCustomId(id(at + 1)).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(at >= pages.length - 1)
)] : []);

function searchEntry(r) {
  const description = clip(String(r.description ?? '').replace(/\s+/g, ' ').trim(), 220);
  const files = r.files ?? [];
  const names = files.slice(0, 3).map(f => (f.url ? `[${linkText(f.name)}](${f.url})` : escapeMd(f.name))).join(', ') + (files.length > 3 ? ` and ${files.length - 3} more` : '');
  const lines = [
    `### [${linkText(clip(r.title, 100))}](${r.publishedUrl})${idTag(r)}`,
    ...(description ? [quote(escapeMd(description))] : []),
    ...(r.tags?.length ? [`**Tags:** ${chips(r.tags)}`] : []),
    r.type === 'link' ? linkLines(r) : `**Files:** ${names || 'none'} / ${formatSize(files.reduce((n, f) => n + (f.size || 0), 0))}`,
    `-# ${[r.submitterId ? `contributor: <@${r.submitterId}>` : null, r.doneAt ? `<t:${Math.floor(new Date(r.doneAt).getTime() / 1000)}:D>` : null].filter(Boolean).join(' / ')}`
  ];
  return lines.join('\n');
}

export function searchView({ serverName, serverIcon, query, tags = [], results, page = 0 }) {
  const all = query.trim() === '*';
  const heading = `## ${serverName ? `${escapeMd(serverName)} ` : ''}Resources`;
  const tagNote = tags.length ? ` / ${tags.length > 1 ? 'tags' : 'tag'}: ${chips(tags)}` : '';
  const sub = `-# ${all ? `${results.length} resource${results.length === 1 ? '' : 's'}` : `${results.length} result${results.length === 1 ? '' : 's'} for "${escapeMd(clip(query, 60))}"`}${tagNote}`;
  const container = build(COLORS.neutral, `${heading}\n${sub}`, serverIcon, true);

  if (results.length === 0) {
    block(container, `No resources found${all ? '' : ` for \`${String(query).replace(/`/g, "'")}\``}${tags.length ? ` with ${tags.length > 1 ? 'tags' : 'tag'} ${chips(tags)}` : ''}.\n${all && !tags.length ? 'Nothing has been published yet.' : 'Try fewer or different words or tags, or use `*` to list every resource.'}`);
    footer(container, 'Oasis');
    return { flags: V2, components: [container], pages: 1, page: 0 };
  }

  const pages = pageEntries(results.map(searchEntry));
  const at = Math.min(Math.max(page, 0), pages.length - 1);
  addPage(container, pages, at, 'Oasis');
  const key = `${clip(tags.join(',').replace(/\|/g, ''), 30)}|${clip(String(query).trim().replace(/\|/g, ' '), 40)}`;
  const components = [container, ...navRow(pages, at, (n) => `search|${n}|${key}`)];
  return { flags: V2, components, pages: pages.length, page: at };
}

export function leaderboardView({ serverName, serverIcon, rows, total, viewer }) {
  const head = `## ${serverName ? `${escapeMd(serverName)} ` : ''}Top Contributors\n-# ${total} published resource${total === 1 ? '' : 's'} from ${rows.length ? `${rows.fullCount ?? rows.length} contributor${(rows.fullCount ?? rows.length) === 1 ? '' : 's'}` : 'no one yet'}`;
  const container = build(COLORS.neutral, head, serverIcon, true);
  if (!rows.length) {
    block(container, 'Nothing has been published yet. Be the first with `/submit`.');
  } else {
    block(container, rows.map((r, i) => `**${i + 1}.** <@${r.id}> / **${r.count}** resource${r.count === 1 ? '' : 's'}\n-# Recent: <t:${Math.floor(new Date(r.latest).getTime() / 1000)}:D>`).join('\n'));
  }
  footer(container, viewer ? `Oasis / you are #${viewer.rank} with ${viewer.count}` : 'Oasis');
  return { flags: V2, components: [container] };
}

const STATUS_LABEL = { pending: 'Pending', processing: 'Pending', approved: 'Approved', rejected: 'Rejected', unpublished: 'Unpublished' };

function submissionEntry(r) {
  const title = escapeMd(clip(r.title ?? 'Untitled', 100));
  const kind = r.type === 'link' ? 'link' : `${(r.files ?? []).length} file${(r.files ?? []).length === 1 ? '' : 's'}`;
  const when = r.createdAt ?? r.doneAt;
  return [
    `### ${r.status === 'approved' && r.publishedUrl ? `[${linkText(clip(r.title ?? 'Untitled', 100))}](${r.publishedUrl})` : title}${idTag(r)}`,
    `**Status:** \`${STATUS_LABEL[r.status] ?? r.status}\` / ${kind}`,
    ...(r.status === 'rejected' && r.reason ? [`**Reason:**\n${quote(clip(String(r.reason), 300))}`] : []),
    ...(when ? [`-# <t:${Math.floor(new Date(when).getTime() / 1000)}:D>`] : [])
  ].join('\n');
}

export function mySubmissionsView({ serverName, serverIcon, rows, page = 0 }) {
  const container = build(COLORS.neutral, `## Your Submissions\n-# ${rows.length} in ${escapeMd(serverName ?? 'this server')}`, serverIcon, true);
  if (!rows.length) {
    block(container, 'You have not submitted anything here yet. Use `/submit link` or `/submit file` to share a resource.');
    footer(container, 'Oasis');
    return { flags: EPHEMERAL_V2, components: [container], pages: 1, page: 0 };
  }
  const pages = pageEntries(rows.map(submissionEntry));
  const at = Math.min(Math.max(page, 0), pages.length - 1);
  addPage(container, pages, at, 'Oasis');
  return { flags: EPHEMERAL_V2, components: [container, ...navRow(pages, at, (n) => `mine|${n}`)], pages: pages.length, page: at };
}

export function bookmarksView({ serverName, serverIcon, resources, page = 0 }) {
  const container = build(COLORS.neutral, `## Your Bookmarks\n-# ${resources.length} saved in ${escapeMd(serverName ?? 'this server')}`, serverIcon, true);
  if (!resources.length) {
    block(container, 'No bookmarks yet. Save a resource with `/bookmark add`.');
    footer(container, 'Oasis');
    return { flags: EPHEMERAL_V2, components: [container], pages: 1, page: 0 };
  }
  const pages = pageEntries(resources.map(searchEntry));
  const at = Math.min(Math.max(page, 0), pages.length - 1);
  addPage(container, pages, at, 'Oasis');
  return { flags: EPHEMERAL_V2, components: [container, ...navRow(pages, at, (n) => `bm|${n}`)], pages: pages.length, page: at };
}

export function unpublishView(title, resourceId) {
  const container = build(COLORS.bad, '## Unpublish Resource\n-# this removes the post for everyone');
  block(container, `**${escapeMd(title)}** will be deleted from the public channel and removed from search, bookmarks and the leaderboard.\n${quote('irreversible - the post cannot be restored; the submitter is not notified')}`);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`unpub:yes:${resourceId}`).setLabel('Unpublish').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('unpub:no:x').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );
  return { flags: EPHEMERAL_V2, components: [container, row] };
}
