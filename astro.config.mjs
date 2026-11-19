// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import starlightLlmsTxt from 'starlight-llms-txt';
import { focusableCode } from './src/lib/focusable-code.mjs';

// The one place the public address lives: canonical URLs, the sitemap, llms.txt and the changelog feed derive from it.
const site = 'https://docs.payment-sandbox.404human.dev';
const repo = 'https://github.com/akira-shirase-oss/payment-sandbox-docs';

export default defineConfig({
	site,
	trailingSlash: 'always',
	output: 'static',
	integrations: [
		starlight({
			title: 'Payment Sandbox Docs',
			description:
				'Documentation for Payment Sandbox, the simulated-money payment platform for development and CI: quick start, payments and the ledger, the hosted checkout, webhooks, the CLI and SDK, and self-hosting.',
			favicon: '/favicon.svg',
			social: [
				{ icon: 'github', label: 'Payment Sandbox on GitHub', href: 'https://github.com/akira-shirase-oss/payment-sandbox' },
			],
			editLink: { baseUrl: `${repo}/edit/main/` },
			lastUpdated: true,
			pagination: true,
			credits: false,
			titleDelimiter: '·',
			tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
			customCss: ['./src/styles/theme.css'],
			head: [
				{ tag: 'link', attrs: { rel: 'alternate', type: 'application/rss+xml', title: 'Payment Sandbox changelog', href: `${site}/changelog/rss.xml` } },
				// An accessibility fix to Starlight's output: the search button shows "Search" and its
				// shortcut (⌘K or Ctrl K), so its name says both, as speech input reads them (WCAG 2.5.3).
				// Starlight swaps ⌘ for Ctrl off a Mac, sometimes after this runs, so the name follows
				// the shortcut's text whenever it changes; and a space separates the visible words
				// ("Search Ctrl K", not "SearchCtrlK"), so the name contains what is shown.
				// (Wide tables and code blocks take keyboard focus from the build instead, WCAG 2.1.1:
				// src/lib/focusable-code.mjs and scripts/focusable-tables.mjs, so they do without JavaScript too.)
				{
					tag: 'script',
					content:
						"document.addEventListener('DOMContentLoaded',()=>{for(const b of document.querySelectorAll('button[data-open-modal]')){const n=()=>{const p=[b.querySelector('span'),...b.querySelectorAll('kbd kbd')];for(const e of p.slice(0,-1))if(e&&e.nextSibling?.nodeValue!==' ')e.after(' ');const k=[...b.querySelectorAll('kbd kbd')].map(e=>e.textContent.trim()).join(' ');if(k)b.setAttribute('aria-label','Search '+k)};n();const s=b.querySelector('kbd');if(s)new MutationObserver(n).observe(s,{subtree:true,childList:true,characterData:true})}});",
				},
			],
			expressiveCode: {
				plugins: [focusableCode()],
				themes: ['github-dark-default', 'github-light-default'],
				styleOverrides: {
					borderRadius: '0.5rem',
				},
			},
			components: {
				PageTitle: './src/components/PageTitle.astro',
				Footer: './src/components/Footer.astro',
			},
			sidebar: [
				{
					label: 'Getting started',
					items: [
						{ label: 'Introduction', slug: 'index' },
						{ label: 'Quick start', slug: 'quick-start' },
						{ label: 'Concepts', slug: 'concepts' },
					],
				},
				{
					label: 'Guides',
					items: [
						{ label: 'Payments', slug: 'payments' },
						{ label: 'The ledger', slug: 'ledger' },
						{ label: 'Hosted checkout', slug: 'checkout' },
						{ label: 'Webhooks', slug: 'webhooks' },
						{ label: 'Failure scenarios', slug: 'scenarios' },
					],
				},
				{ label: 'API reference', link: '/api/reference/', attrs: { 'data-reference': '' } },
				{ label: 'Changelog', link: '/changelog/' },
			],
			plugins: [
				starlightLinksValidator({ errorOnLocalLinks: true, exclude: ['/api/reference/', '/changelog/', '/changelog/**'] }),
				starlightLlmsTxt({
					projectName: 'Payment Sandbox',
					description:
						'Payment Sandbox is a simulated-money payment platform for development and CI (a Rust server, CLI and TypeScript SDK): stores take payments, watch every way a network fails, and prove the books balance against an immutable double-entry journal. No real cards or money, ever.',
				}),
			],
		}),
	],
});
