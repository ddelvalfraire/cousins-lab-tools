// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// GitHub Pages serves this site from a project sub-path, so every page and
// asset URL starts with `base`.
export default defineConfig({
	site: 'https://ddelvalfraire.github.io',
	base: '/cousins-lab-tools',
	integrations: [
		starlight({
			title: 'Cousins Lab Tools',
			description: 'User manual for the Cousins Lab mass spectrometer applications.',
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/ddelvalfraire/cousins-lab-tools',
				},
			],
			sidebar: [
				{ label: 'Home', slug: 'index' },
				{
					label: 'Modules 1 and 2 (legacy)',
					items: [{ autogenerate: { directory: 'legacy' } }],
				},
			],
		}),
	],
});
