import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getGuildConfig, createDraft } from '../database.js';
import { draftView } from '../ui.js';
import { normalizeUrl } from '../links.js';

export const data = new SlashCommandBuilder()
  .setName('submit')
  .setDescription('Submit a resource for review')
  .addSubcommand(subcommand =>
    subcommand
      .setName('link')
      .setDescription('Submit a web link/resource')
      .addStringOption(option =>
        option.setName('title').setDescription('The title of the resource').setRequired(true).setMaxLength(100)
      )
      .addStringOption(option =>
        option.setName('url').setDescription('The URL link of the resource').setRequired(true).setMaxLength(2000)
      )
      .addStringOption(option =>
        option.setName('url2').setDescription('A second link (optional)').setMaxLength(2000)
      )
      .addStringOption(option =>
        option.setName('url3').setDescription('A third link (optional)').setMaxLength(2000)
      )
      .addStringOption(option =>
        option.setName('url4').setDescription('A fourth link (optional)').setMaxLength(2000)
      )
      .addStringOption(option =>
        option.setName('url5').setDescription('A fifth link (optional)').setMaxLength(2000)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('file')
      .setDescription('Submit a file/attachment resource')
      .addStringOption(option =>
        option.setName('title').setDescription('The title of the resource').setRequired(true).setMaxLength(100)
      )
      .addAttachmentOption(option =>
        option.setName('file').setDescription('Upload the file/attachment').setRequired(true)
      )
      .addAttachmentOption(option =>
        option.setName('file2').setDescription('Upload a second file/attachment (optional)')
      )
      .addAttachmentOption(option =>
        option.setName('file3').setDescription('Upload a third file/attachment (optional)')
      )
      .addAttachmentOption(option =>
        option.setName('file4').setDescription('Upload a fourth file/attachment (optional)')
      )
      .addAttachmentOption(option =>
        option.setName('file5').setDescription('Upload a fifth file/attachment (optional)')
      )
  );

async function reject(interaction, content) {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

export async function execute(interaction) {
  const guildId = interaction.guildId;
  const config = await getGuildConfig(guildId);

  if (!config || !config.reviewChannelId || !config.publicChannelId) {
    await reject(interaction, 'Error: Oasis has not been configured on this server yet. Please ask an Administrator to run `/configure`.');
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const title = interaction.options.getString('title');
  let draft;

  if (subcommand === 'link') {
    const urls = [];
    for (const name of ['url', 'url2', 'url3', 'url4', 'url5']) {
      const raw = interaction.options.getString(name);
      if (!raw) continue;
      const url = normalizeUrl(raw);
      if (!url) {
        await reject(interaction, `Error: \`${name}\` does not look like a link. Paste the full address, for example https://example.com.`);
        return;
      }
      if (!urls.includes(url)) urls.push(url);
    }
    if (!urls.length) {
      await reject(interaction, 'Error: That does not look like a link. Paste the full address, for example https://example.com.');
      return;
    }
    draft = { type: 'link', title, url: urls[0], urls };
  } else {
    const files = [];
    for (const name of ['file', 'file2', 'file3', 'file4', 'file5']) {
      const file = interaction.options.getAttachment(name);
      if (file) files.push({ name: file.name, url: file.url, size: file.size });
    }
    draft = { type: 'file', title, files };
  }

  const draftId = await createDraft({ guildId, userId: interaction.user.id, ...draft });
  if (!draftId) {
    await reject(interaction, 'Failed to save your draft. Database error.');
    return;
  }

  await interaction.reply(draftView({ draftId, ...draft }));
}
