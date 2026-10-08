// Vitest 테스트 — Master 항목 응답을 이름 배열/id 배열로 나누는 순수 함수를 확인한다.
// Svelte·fetch에 의존하지 않으므로 가짜(mock) 없이 입력과 출력만 비교한다.
import { describe, expect, it } from 'vitest';
import { splitGrouped } from './masterItem.js';

const KEYS = ['status', 'category', 'assembler', 'chipSize', 'pkgType'];

describe('splitGrouped', () => {
	it('R1 5개 키의 itemName/id를 순서를 유지하며 나눈다', () => {
		const grouped = {
			status: [
				{ id: 's1', itemName: 'new' },
				{ id: 's2', itemName: 'done' }
			],
			category: [{ id: 'c1', itemName: 'A' }],
			assembler: [{ id: 'a1', itemName: 'X사' }],
			chipSize: [
				{ id: 'z1', itemName: '5x5' },
				{ id: 'z2', itemName: '8x8' }
			],
			pkgType: [{ id: 'p1', itemName: 'BGA' }]
		};

		expect(splitGrouped(grouped, KEYS)).toEqual({
			names: {
				status: ['new', 'done'],
				category: ['A'],
				assembler: ['X사'],
				chipSize: ['5x5', '8x8'],
				pkgType: ['BGA']
			},
			ids: {
				status: ['s1', 's2'],
				category: ['c1'],
				assembler: ['a1'],
				chipSize: ['z1', 'z2'],
				pkgType: ['p1']
			}
		});
	});

	it('R2 응답에 없는 키는 빈 배열로 채운다', () => {
		const result = splitGrouped({ status: [{ id: 's1', itemName: 'new' }] }, KEYS);

		expect(result.names.pkgType).toEqual([]);
		expect(result.ids.pkgType).toEqual([]);
		expect(result.names.status).toEqual(['new']);
	});

	it('R3 응답 필드가 빈 배열이면 결과도 빈 배열이다', () => {
		const result = splitGrouped({ category: [] }, ['category']);

		expect(result).toEqual({ names: { category: [] }, ids: { category: [] } });
	});

	it('R4 keys에 없는 응답 필드는 결과에 포함되지 않는다', () => {
		const grouped = {
			status: [{ id: 's1', itemName: 'new' }],
			unknown: [{ id: 'u1', itemName: '무시' }]
		};

		const result = splitGrouped(grouped, ['status']);

		expect(Object.keys(result.names)).toEqual(['status']);
		expect(Object.keys(result.ids)).toEqual(['status']);
	});
});
