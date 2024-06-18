import yargs from 'yargs';
import PromptSync from 'prompt-sync';
import fetch from 'node-fetch';
import { PDFDocument } from 'pdf-lib';
import puppeteer from 'puppeteer';
import fs from 'fs';

const argv = yargs(process.argv)
	.option('url', {
		alias: 'u',
		type: 'string',
		description: 'URL of the demo book',
	})
	.option('output', {
		alias: 'o',
		type: 'string',
		description: 'Output file',
	})
	.help()
	.argv;

const prompt = PromptSync({ sigint: true });

(async () => {
	let url = argv.url;

	while (!url)
		url = prompt('Enter the URL of the demo book: ');

	let page = await fetch(url).then((res) => res.text());

	let title = page.match(/<title>([^<]+)<\/title>/)[1];

	url = new URL(url);
	url.pathname = url.pathname.replace(/\/(?:\d+\/)?index.html$/, '');
	url = url.toString();

	console.log("Downloading " + title);

	let pager = await fetch(url + '/files/assets/pager.js').then((res) => res.json());

	let browser = await puppeteer.launch({headless: false});
	let browserPage = await browser.newPage();

	let doc = await PDFDocument.create();

	for (let i = 0; i < pager.pages.structure.length; i++) {
		console.log("Downloading page " + (i + 1) + " of " + pager.pages.structure.length);
		
		let pageName = pager.pages.structure[i];
		let page = { ...pager.pages.defaults, ...pager.pages[pageName] };

		await browserPage.setViewport({ width: page.width, height: page.height });

		let textOverlay = '';

		if (page.textLayer) {
			textOverlay = `<img src="${url}/files/assets/common/page-vectorlayers/${("000" + pageName).slice(-4)}.svg" style="width: ${page.width}px; height: ${page.height}px; position: absolute; top: 0; left: 0;">`;
		}

		await browserPage.setContent(`
			<!DOCTYPE html>
			<html>
				<body style="margin: 0; heigth: ${page.height}px; width: ${page.width}px; position: absolute; top: 0; left: 0; overflow: hidden;">
					<img src="${url}/files/assets/common/page-html5-substrates/page${("000" + pageName).slice(-4)}_${page.substrateSizesReady}.${page.substrateFormat}" style="width: ${page.width}px; height: ${page.height}px; position: absolute; top: 0; left: 0;">
					${textOverlay}
				</body>
			</html>
		`, { waitUntil: 'networkidle0' });

		const pagePdf = await PDFDocument.load(await browserPage.pdf({height: page.height, width: page.width}));
		const [firstDonorPage] = await doc.copyPages(pagePdf, [0]);
		doc.addPage(firstDonorPage);
	}

	await browser.close();

	fs.promises.writeFile(argv.output || title.replace(/[\\/:*?"<>|]/g, '') + '.pdf', await doc.save());
	console.log("Downloaded complete!");

})();