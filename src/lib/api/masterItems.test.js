// Vitest 테스트 — master-items 리소스 함수가 올바른 URL/메서드/본문으로 fetch를 부르는지 확인한다.
// Jest의 jest.fn()과 같은 vi.fn()으로 fetch를 가짜로 바꿔, 실제 백엔드 없이 요청 내용만 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMasterItem, deleteMasterItem, listMasterItems } from './masterItems.js';

const BASE = 'http://api.test/api';
const jsonResponse = (data, status = 200) =>
	new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

let fetchMock;

beforeEach(() => {
	vi.stubEnv('VITE_API_BASE_URL', BASE);
	fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('masterItems', () => {
	it('listMasterItems는 GET /master-items 를 호출한다', async () => {
		await listMasterItems();
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(`${BASE}/master-items`);
		expect(init).toStrictEqual({ method: 'GET', credentials: 'include' });
	});

	it('createMasterItem은 POST + JSON body {fieldName, itemName} 를 보낸다', async () => {
		await createMasterItem('category', 'A');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(`${BASE}/master-items`);
		expect(init).toStrictEqual({
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ fieldName: 'category', itemName: 'A' })
		});
	});

	it('deleteMasterItem은 DELETE /master-items/:id 를 호출한다', async () => {
		await deleteMasterItem('id-1');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(`${BASE}/master-items/id-1`);
		expect(init).toStrictEqual({ method: 'DELETE', credentials: 'include' });
	});
});
