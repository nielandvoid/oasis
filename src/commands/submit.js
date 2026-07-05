import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('submit')
  .setDescription('Submit a resource for review');

export async function execute(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('submit-resource-modal')
    .setTitle('Submit a Resource');

  const titleInput = new TextInputBuilder()
    .setCustomId('resource-title')
    .setLabel('Resource Title')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., Learn Git Branching')
    .setRequired(true)
    .setMaxLength(100);

  const urlInput = new TextInputBuilder()
    .setCustomId('resource-url')
    .setLabel('Resource URL / Link')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., https://learngitbranching.js.org')
    .setRequired(true);

  const descInput = new TextInputBuilder()
    .setCustomId('resource-desc')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Explain what this resource is and why it is helpful...')
    .setRequired(true)
    .setMaxLength(1000);

  const row1 = new ActionRowBuilder().addComponents(titleInput);
  const row2 = new ActionRowBuilder().addComponents(urlInput);
  const row3 = new ActionRowBuilder().addComponents(descInput);

  modal.addComponents(row1, row2, row3);

  await interaction.showModal(modal);
}
