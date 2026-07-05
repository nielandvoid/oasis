import { SlashCommandBuilder } from 'discord.js';
import { submitResource } from '../handlers/review.js';

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
        option.setName('description').setDescription('Describe what this resource is').setRequired(true).setMaxLength(1000)
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
      .addStringOption(option =>
        option.setName('description').setDescription('Describe what this resource is').setRequired(true).setMaxLength(1000)
      )
      .addAttachmentOption(option =>
        option.setName('file').setDescription('Upload the file/attachment').setRequired(true)
      )
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const title = interaction.options.getString('title');
  const description = interaction.options.getString('description');

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

    await submitResource(interaction, { type: 'link', title, description, url });
  } else if (subcommand === 'file') {
    const file = interaction.options.getAttachment('file');
    await submitResource(interaction, { type: 'file', title, description, file });
  }
}
