// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://stacksolo.dev',
	integrations: [
		starlight({
			title: 'StackSolo',
			description: 'Open source infrastructure for solo developers. Turn simple JSON configs into production-ready GCP deployments.',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/monkeybarrels/stacksolo' },
				{ icon: 'external', label: 'npm', href: 'https://www.npmjs.com/package/@stacksolo/cli' },
			],
						customCss: ['./src/styles/custom.css'],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', slug: 'getting-started/introduction' },
						{ label: 'Installation', slug: 'getting-started/installation' },
						{ label: 'Local Development', slug: 'guides/local-development' },
						{ label: 'Deployment', slug: 'guides/deployment' },
					],
				},
				{
					label: 'Guides',
					items: [
						{ label: 'Configuration', slug: 'guides/configuration' },
						{ label: 'Secrets Management', slug: 'guides/secrets' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'CLI Commands', slug: 'reference/cli' },
						{ label: 'Config Schema', slug: 'reference/config-schema' },
					],
				},
				{
					label: 'Plugins',
					items: [
						{ label: 'GCP CDKTF', slug: 'plugins/gcp-cdktf' },
						{ label: 'Cloudflare', slug: 'plugins/cloudflare' },
						{ label: 'Helm', slug: 'plugins/helm' },
						{ label: 'Zero Trust', slug: 'plugins/zero-trust' },
						{ label: 'Zero Trust Auth', slug: 'plugins/zero-trust-auth' },
						{ label: 'Kernel', slug: 'plugins/kernel' },
						{ label: 'GCP Kernel', slug: 'plugins/gcp-kernel' },
					],
				},
				{
					label: 'Architecture',
					items: [
						{ label: 'Overview', slug: 'architecture/overview' },
						{ label: 'Plugin Development', slug: 'architecture/plugin-development' },
					],
				},
			],
		}),
	],
});
