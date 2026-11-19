import { EmbedBuilder } from 'discord.js';

const field = (embed, name) => embed.fields.find(f => f.name === name)?.value;

function fileFields(embed, withSize) {
  const files = [];
  for (let idx = 1; ; idx++) {
    const name = field(embed, `File ${idx} Name`);
    const url = field(embed, `File ${idx} URL`);
    const size = field(embed, `File ${idx} Size`);
    if (!name || !url || (withSize && size === undefined)) break;
    files.push({ name, url, size: parseInt(size) || 0 });
  }
  return files;
}

export function legacyDraft(embed, type) {
  const title = embed.title.replace('Draft: ', '');
  return type === 'link' ? { type, title, url: field(embed, 'URL') } : { type, title, files: fileFields(embed, true) };
}

export function legacySubmission(embed) {
  const footer = embed.footer?.text ?? '';
  const type = footer.match(/Type: (link|file)/)?.[1] ?? 'link';
  const tags = (field(embed, 'Selected Tag') ?? field(embed, 'Selected Tags') ?? '').split(', ').filter(Boolean);
  const sub = {
    type,
    submitterId: footer.match(/Submitter: (\d+)/)?.[1] ?? null,
    title: field(embed, 'Title'),
    description: field(embed, 'Description'),
    tags
  };
  if (type === 'link') sub.url = field(embed, 'URL / Link');
  else sub.files = fileFields(embed, false);
  return sub;
}

export const legacyApproved = (embed, tag) => EmbedBuilder.from(embed)
  .setColor('#7ee8a8')
  .setTitle('Resource Approved')
  .setDescription(`This resource was approved and published by ${tag}.`)
  .setFooter({ text: `Approved by ${tag}` });

export const legacyRejected = (embed, tag, reason) => EmbedBuilder.from(embed)
  .setColor('#ff8b9a')
  .setTitle('Resource Rejected')
  .setDescription(`This resource was rejected by ${tag}.`)
  .addFields({ name: 'Rejection Reason', value: reason })
  .setFooter({ text: `Rejected by ${tag}` });

export function legacyPublicEmbed(sub, attachments) {
  const embed = new EmbedBuilder()
    .setTitle(sub.title)
    .setColor('#c49bff')
    .setDescription(sub.description)
    .addFields({ name: 'Contributor', value: `<@${sub.submitterId}>`, inline: true })
    .setFooter({ text: 'Published via Oasis' })
    .setTimestamp();
  const filesOption = [];

  if (sub.type === 'link') {
    embed.setURL(sub.url);
    embed.addFields({ name: 'Link', value: `[Visit Resource](${sub.url})`, inline: true });
    return { embed, filesOption };
  }

  sub.files.forEach((file, index) => {
    const attachment = attachments.find(att => att.name === file.name);
    if (attachment) {
      const isImage = attachment.contentType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(attachment.name);
      if (isImage && sub.files.length === 1) embed.setImage(`attachment://${attachment.name}`);
      else embed.addFields({ name: `Attachment ${index + 1}`, value: `[Download ${attachment.name}](${attachment.url})`, inline: true });
      filesOption.push({ attachment: attachment.url, name: attachment.name });
    } else {
      embed.addFields({ name: `Attachment ${index + 1} (Large File)`, value: `[Download ${file.name}](${file.url})`, inline: true });
    }
  });
  return { embed, filesOption };
}
