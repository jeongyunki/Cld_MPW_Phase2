/**
 * ============================================================
 * xlsxImage.js
 * ============================================================
 * 엑셀 파일(.xlsx)의 첫 번째 시트에 붙어 있는 이미지를 꺼낸다.
 * SheetJS(커뮤니티 판)는 셀 값만 읽고 이미지는 주지 않으므로,
 * xlsx가 사실은 zip 파일이라는 점을 이용해 안의 XML을 직접 따라간다.
 *
 *   workbook.xml        첫 번째 <sheet>의 r:id
 *   → workbook.xml.rels 그 id의 시트 파일 (worksheets/sheet1.xml)
 *   → sheet1.xml.rels   그 시트의 drawing 파일 (drawings/drawing1.xml)
 *   → drawing1.xml      첫 번째 그림의 r:embed id
 *   → drawing1.xml.rels 그 id의 이미지 파일 (media/image1.jpg)
 *
 * Svelte에 의존하지 않는 순수 함수라서 Vitest로 바로 테스트할 수 있다.
 * ============================================================
 */

import { CFB } from 'xlsx';

// 브라우저 <img>/canvas가 그릴 수 있는 형식만 다룬다 (emf/wmf 등은 이미지 없음으로 본다)
const MIME_TYPES = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	bmp: 'image/bmp',
	webp: 'image/webp'
};

// zip 안의 파일 내용을 문자열로 (없으면 null). CFB.find는 '/'로 시작하는 경로를 받는다.
function readText(zip, path) {
	const entry = CFB.find(zip, `/${path}`);
	return entry ? new TextDecoder().decode(entry.content) : null;
}

// .rels 파일에서 Id → Target 을 찾는다. 속성 순서가 파일마다 달라서 태그 단위로 본다.
function findTarget(relsXml, id) {
	for (const tag of relsXml.match(/<Relationship\b[^>]*>/g) ?? []) {
		if (tag.match(/\bId="([^"]+)"/)?.[1] === id) return tag.match(/\bTarget="([^"]+)"/)?.[1];
	}
	return null;
}

// .rels의 Target은 그 파일이 있는 폴더 기준 상대경로다 ('../media/image1.jpg').
// 'xl/worksheets/sheet1.xml' 기준으로 풀면 'xl/media/image1.jpg'.
function resolvePath(fromFile, target) {
	if (target.startsWith('/')) return target.slice(1);
	const parts = fromFile.split('/').slice(0, -1);
	for (const part of target.split('/')) {
		if (part === '..') parts.pop();
		else if (part !== '.') parts.push(part);
	}
	return parts.join('/');
}

// 'xl/worksheets/sheet1.xml' → 'xl/worksheets/_rels/sheet1.xml.rels'
function relsPathOf(file) {
	const i = file.lastIndexOf('/');
	return `${file.slice(0, i)}/_rels/${file.slice(i + 1)}.rels`;
}

/**
 * @param {ArrayBuffer} data - 서버에서 내려받은 파일 내용 (Blob.arrayBuffer() 결과)
 * @returns {{ bytes: Uint8Array, mimeType: string, name: string } | null} 첫 시트의 첫 이미지, 없으면 null
 */
export function extractFirstSheetImage(data) {
	let zip;
	try {
		zip = CFB.read(new Uint8Array(data), { type: 'array' });
	} catch {
		return null; // zip/엑셀 형식이 아니면 이미지도 없다
	}

	const workbook = readText(zip, 'xl/workbook.xml');
	const sheetId = workbook?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
	const workbookRels = readText(zip, 'xl/_rels/workbook.xml.rels');
	const sheetTarget = sheetId && workbookRels && findTarget(workbookRels, sheetId);
	if (!sheetTarget) return null;
	const sheetFile = resolvePath('xl/workbook.xml', sheetTarget);

	// 시트 → drawing (시트 XML의 <drawing r:id> 로 찾는다)
	const sheetXml = readText(zip, sheetFile);
	const drawingId = sheetXml?.match(/<drawing\b[^>]*\br:id="([^"]+)"/)?.[1];
	const sheetRels = readText(zip, relsPathOf(sheetFile));
	const drawingTarget = drawingId && sheetRels && findTarget(sheetRels, drawingId);
	if (!drawingTarget) return null;
	const drawingFile = resolvePath(sheetFile, drawingTarget);

	// drawing → 첫 번째 그림의 이미지 파일
	const drawingXml = readText(zip, drawingFile);
	const embedId = drawingXml?.match(/<a:blip\b[^>]*\br:embed="([^"]+)"/)?.[1];
	const drawingRels = readText(zip, relsPathOf(drawingFile));
	const imageTarget = embedId && drawingRels && findTarget(drawingRels, embedId);
	if (!imageTarget) return null;
	const imageFile = resolvePath(drawingFile, imageTarget);

	const extension = imageFile.split('.').pop().toLowerCase();
	const entry = CFB.find(zip, `/${imageFile}`);
	if (!entry || !MIME_TYPES[extension]) return null;
	return {
		bytes: new Uint8Array(entry.content),
		mimeType: MIME_TYPES[extension],
		name: imageFile.split('/').pop()
	};
}
