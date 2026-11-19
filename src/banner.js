import { AttachmentBuilder } from 'discord.js';
import { fileURLToPath } from 'url';
import { BANNER } from './ui.js';

const bannerPath = fileURLToPath(new URL(`../${BANNER}`, import.meta.url));

export const bannerFile = () => new AttachmentBuilder(bannerPath, { name: BANNER });
