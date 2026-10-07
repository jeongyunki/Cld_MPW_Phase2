// Vitest 테스트 — imgagong-plans 리소스 함수가 올바른 URL/메서드/본문으로 fetch를 부르는지 확인한다.
// Jest의 jest.fn()과 같은 vi.fn()으로 fetch를 가짜로 바꿔, 실제 백엔드 없이 요청 내용만 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createImgagongPlan,
	deleteImgagongPlan,
	listImgagongPlans,
	updateImgagongPlan
} from './imgagongPlans.js';

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

describe('imgagongPlans', () => {
	it('listImgagongPlans는 필터를 query string으로 만든다', async () => {
		await listImgagongPlans({ page: 1, limit: 20, startMonth: '2026-01', endMonth: '2026-03' });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(`${BASE}/imgagong-plans?page=1&limit=20&startMonth=2026-01&endMonth=2026-03`);
		expect(init).toStrictEqual({ method: 'GET', credentials: 'include' });
	});

	it('listImgagongPlans()는 인자가 없으면 ? 를 붙이지 않는다', async () => {
		await listImgagongPlans();
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe(`${BASE}/imgagong-plans`);
	});

	it('createImgagongPlan은 POST + JSON body 를 보낸다', async () => {
		const fields = { owner: 'kim', product: 'P1' };
		await createImgagongPlan(fields);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(`${BASE}/imgagong-plans`);
		expect(init).toStrictEqual({
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(fields)
		});
	});

	it('updateImgagongPlan은 PATCH + version 을 포함한 body 를 보낸다', async () => {
		await updateImgagongPlan('id-1', { owner: 'kim', version: 3 });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(`${BASE}/imgagong-plans/id-1`);
		expect(init.body).toContain('"version":3');
		expect(init).toStrictEqual({
			method: 'PATCH',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ owner: 'kim', version: 3 })
		});
	});

	it('deleteImgagongPlan은 DELETE /imgagong-plans/:id 를 호출한다', async () => {
		await deleteImgagongPlan('id-1');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(`${BASE}/imgagong-plans/id-1`);
		expect(init).toStrictEqual({ method: 'DELETE', credentials: 'include' });
	});
});
