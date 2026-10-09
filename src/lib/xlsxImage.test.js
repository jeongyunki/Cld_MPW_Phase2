// Vitest 테스트 — 엑셀(zip) 안의 XML 연결을 따라가 첫 시트의 이미지를 꺼내는지 확인한다.
// 테스트용 xlsx는 SheetJS의 CFB(zip 도구)로 필요한 파일만 넣어 메모리에서 만든다.
import { describe, expect, it } from 'vitest';
import { CFB, utils, write } from 'xlsx';
import { extractFirstSheetImage } from './xlsxImage.js';

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const enc = (s) => new TextEncoder().encode(s);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 4, 5, 6]);

const rels = (items) =>
	`<Relationships>${items.map(([id, target]) => `<Relationship Id="${id}" Type="${REL}/x" Target="${target}"/>`).join('')}</Relationships>`;
const sheetXml = (drawingId) =>
	`<worksheet><sheetData/>${drawingId ? `<drawing r:id="${drawingId}"/>` : ''}</worksheet>`;
const drawingXml = (embedId) =>
	`<xdr:wsDr><xdr:pic><xdr:blipFill><a:blip cstate="print" r:embed="${embedId}"/></xdr:blipFill></xdr:pic></xdr:wsDr>`;

// files: { 'xl/...': string | Uint8Array } → xlsx(zip) ArrayBuffer
function makeZip(files) {
	const cfb = CFB.utils.cfb_new();
	for (const [path, content] of Object.entries(files)) {
		CFB.utils.cfb_add(cfb, `/${path}`, typeof content === 'string' ? enc(content) : content);
	}
	return new Uint8Array(CFB.write(cfb, { fileType: 'zip', type: 'array' })).buffer;
}

// 시트 두 개짜리 기본 구조. 이미지는 첫 시트(sheet1)에 붙어 있다.
function baseFiles() {
	return {
		'xl/workbook.xml':
			'<workbook><sheets><sheet name="시트1" sheetId="1" r:id="rId5"/><sheet name="image" sheetId="2" r:id="rId6"/></sheets></workbook>',
		'xl/_rels/workbook.xml.rels': rels([
			['rId5', 'worksheets/sheet1.xml'],
			['rId6', 'worksheets/sheet2.xml']
		]),
		'xl/worksheets/sheet1.xml': sheetXml('rId1'),
		'xl/worksheets/_rels/sheet1.xml.rels': rels([['rId1', '../drawings/drawing1.xml']]),
		'xl/drawings/drawing1.xml': drawingXml('rId1'),
		'xl/drawings/_rels/drawing1.xml.rels': rels([['rId1', '../media/image1.jpg']]),
		'xl/media/image1.jpg': JPG
	};
}

describe('extractFirstSheetImage', () => {
	it('I1 첫 시트에 붙은 jpg 이미지의 바이트와 형식을 돌려준다', () => {
		expect(extractFirstSheetImage(makeZip(baseFiles()))).toStrictEqual({
			bytes: JPG,
			mimeType: 'image/jpeg',
			name: 'image1.jpg'
		});
	});

	it('I2 drawing에 그림이 여러 개면 첫 번째 그림(r:embed)의 이미지를 고른다', () => {
		const files = baseFiles();
		files['xl/drawings/drawing1.xml'] = drawingXml('rId2') + drawingXml('rId1');
		files['xl/drawings/_rels/drawing1.xml.rels'] = rels([
			['rId1', '../media/image1.jpg'],
			['rId2', '../media/image2.png']
		]);
		files['xl/media/image2.png'] = PNG;
		expect(extractFirstSheetImage(makeZip(files))).toMatchObject({
			bytes: PNG,
			mimeType: 'image/png'
		});
	});

	it('I3 속성 순서가 달라도(Target이 Id보다 앞) 찾고, 절대경로 Target도 푼다', () => {
		const files = baseFiles();
		files['xl/drawings/_rels/drawing1.xml.rels'] =
			`<Relationships><Relationship Target="/xl/media/image1.jpg" Type="${REL}/image" Id="rId1"/></Relationships>`;
		expect(extractFirstSheetImage(makeZip(files))?.name).toBe('image1.jpg');
	});

	it('I4 이미지가 두 번째 시트에만 있으면 null (첫 시트 기준)', () => {
		const files = baseFiles();
		files['xl/worksheets/sheet1.xml'] = sheetXml(null);
		files['xl/worksheets/sheet2.xml'] = sheetXml('rId1');
		files['xl/worksheets/_rels/sheet2.xml.rels'] = rels([['rId1', '../drawings/drawing1.xml']]);
		expect(extractFirstSheetImage(makeZip(files))).toBeNull();
	});

	it('I5 drawing은 있지만 그림(blip)이 없으면 null (도형·차트만 있는 경우)', () => {
		const files = baseFiles();
		files['xl/drawings/drawing1.xml'] = '<xdr:wsDr><xdr:sp/></xdr:wsDr>';
		expect(extractFirstSheetImage(makeZip(files))).toBeNull();
	});

	it('I6 브라우저가 그릴 수 없는 형식(emf)이거나 이미지 파일이 빠져 있으면 null', () => {
		const emf = baseFiles();
		emf['xl/drawings/_rels/drawing1.xml.rels'] = rels([['rId1', '../media/image1.emf']]);
		emf['xl/media/image1.emf'] = JPG;
		expect(extractFirstSheetImage(makeZip(emf))).toBeNull();

		const missing = baseFiles();
		delete missing['xl/media/image1.jpg'];
		expect(extractFirstSheetImage(makeZip(missing))).toBeNull();
	});

	it('I7 연결 정보(rels)가 없거나 id가 맞지 않으면 null', () => {
		const noWorkbookRels = baseFiles();
		delete noWorkbookRels['xl/_rels/workbook.xml.rels'];
		expect(extractFirstSheetImage(makeZip(noWorkbookRels))).toBeNull();

		const wrongDrawingId = baseFiles();
		wrongDrawingId['xl/worksheets/sheet1.xml'] = sheetXml('rId9');
		expect(extractFirstSheetImage(makeZip(wrongDrawingId))).toBeNull();

		const noDrawingRels = baseFiles();
		delete noDrawingRels['xl/drawings/_rels/drawing1.xml.rels'];
		expect(extractFirstSheetImage(makeZip(noDrawingRels))).toBeNull();
	});

	it('I8 SheetJS로 만든 이미지 없는 실제 xlsx는 null', () => {
		const workbook = utils.book_new();
		utils.book_append_sheet(
			workbook,
			utils.aoa_to_sheet([['M1', '', '', 1, 2, '', '', 3, 4]]),
			'S'
		);
		expect(extractFirstSheetImage(write(workbook, { type: 'array', bookType: 'xlsx' }))).toBeNull();
	});

	it('I9 zip/엑셀이 아닌 데이터는 예외 없이 null', () => {
		expect(extractFirstSheetImage(new Uint8Array([1, 2, 3, 4]).buffer)).toBeNull();
		expect(extractFirstSheetImage(new ArrayBuffer(0))).toBeNull();
	});
});
