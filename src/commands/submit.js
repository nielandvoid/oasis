import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

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
        option.setName('url').setDescription('The URL link of the resource').setRequired(true)
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
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const title = interaction.options.getString('title');

  if (subcommand === 'link') {
    let url = interaction.options.getString('url').trim();

    const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
    if (!urlRegex.test(url)) {
      await interaction.reply({ 
        content: 'Error: Please provide a valid URL link (e.g., https://example.com).', 
        ephemeral: true 
      });
      return;
    }

    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    const draftEmbed = new EmbedBuilder()
      .setTitle(`Draft: ${title}`)
      .setColor('#3498db')
      .setDescription('Your submission is almost ready. Click below to add a description (markdown and linebreaks supported).')
      .addFields({ name: 'URL', value: url });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('write-desc:link')
        .setLabel('Write Description')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({ embeds: [draftEmbed], components: [row], ephemeral: true });
  } else if (subcommand === 'file') {
    const file = interaction.options.getAttachment('file');

    const draftEmbed = new EmbedBuilder()
      .setTitle(`Draft: ${title}`)
      .setColor('#3498db')
      .setDescription('Your submission is almost ready. Click below to add a description (markdown and linebreaks supported).')
      .addFields(
        { name: 'File Name', value: file.name },
        { name: 'File URL', value: file.url },
        { name: 'File Size', value: file.size.toString() }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('write-desc:file')
        .setLabel('Write Description')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({ 
      embeds: [draftEmbed], 
      components: [row], 
      ephemeral: true 
    });
  }
}
