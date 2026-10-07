// Vitest 테스트 — deliverables 리소스 함수가 올바른 URL/메서드/본문으로 fetch를 부르는지 확인한다.
// Jest의 jest.fn()과 같은 vi.fn()으로 fetch를 가짜로 바꿔, 실제 백엔드 없이 요청 내용만 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createDeliverable,
	deleteDeliverable,
	downloadDeliverable,
	listDeliverables
} from './deliverables.js';

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

describe('deliverables', () => {
	it('listDeliverables는 page/limit/search 를 query string으로 만든다', async () => {
		await listDeliverables({ page: 2, limit: 10, search: 'MPW' });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(`${BASE}/deliverables?page=2&limit=10&search=MPW`);
		expect(init).toStrictEqual({ method: 'GET', credentials: 'include' });
	});

	it('listDeliverables()는 인자가 없으면 ? 를 붙이지 않는다', async () => {
		await listDeliverables();
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe(`${BASE}/deliverables`);
	});

	it('createDeliverable은 POST + FormData(headers 없음)로 보낸다', async () => {
		await createDeliverable({
			mpwRound: 'R1',
			processName: 'P1',
			file: new File(['x'], 'a.xlsx')
		});
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(`${BASE}/deliverables`);
		expect(init.method).toBe('POST');
		expect(init.credentials).toBe('include');
		expect('headers' in init).toBe(false);
		expect(init.body).toBeInstanceOf(FormData);
		expect(init.body.get('mpwRound')).toBe('R1');
		expect(init.body.get('processName')).toBe('P1');
		expect(init.body.get('file').name).toBe('a.xlsx');
	});

	it('downloadDeliverable은 GET /deliverables/:id/download 로 Blob을 받는다', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response('abc', { status: 200, headers: { 'Content-Type': 'application/octet-stream' } })
		);
		const result = await downloadDeliverable('id-1');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(`${BASE}/deliverables/id-1/download`);
		expect(init).toStrictEqual({ method: 'GET', credentials: 'include' });
		expect(result).toBeInstanceOf(Blob);
	});

	it('deleteDeliverable은 DELETE /deliverables/:id 를 호출한다', async () => {
		await deleteDeliverable('id-1');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(`${BASE}/deliverables/id-1`);
		expect(init).toStrictEqual({ method: 'DELETE', credentials: 'include' });
	});
});
