// Vitest 테스트 — client.js의 request 함수를 검증한다.
// Jest의 jest.fn()과 같은 vi.fn()으로 fetch를 가짜로 바꿔, 실제 네트워크 없이 요청 내용만 확인한다.
// globals를 쓰지 않으므로 describe/it/expect/vi를 'vitest'에서 직접 import 한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from './client.js';

const BASE = 'http://api.test/api';
// Response는 한 번 읽으면 재사용할 수 없으므로 케이스마다 새로 만든다.
const jsonResponse = (data, status = 200) =>
	new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

let fetchMock;

beforeEach(() => {
	// vi.stubEnv: import.meta.env 값을 테스트 동안만 바꾼다.
	vi.stubEnv('VITE_API_BASE_URL', BASE);
	fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
	// vi.stubGlobal: 전역 fetch를 가짜로 교체한다.
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('request - URL', () => {
	it('C1 base URL과 path를 이어 붙인다', async () => {
		await request('/master-items');
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe(`${BASE}/master-items`);
	});

	it('C2 base 끝 슬래시는 하나 제거한다', async () => {
		vi.stubEnv('VITE_API_BASE_URL', `${BASE}/`);
		await request('/master-items');
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe(`${BASE}/master-items`);
	});

	it('C3 base가 없으면(undefined) fetch 없이 설정 안내 에러로 reject 한다', async () => {
		vi.stubEnv('VITE_API_BASE_URL', undefined);
		const err = await request('/x').catch((e) => e);
		expect(err).toBeInstanceOf(Error);
		expect(err.message).toBe('VITE_API_BASE_URL이 설정되지 않았습니다 (루트 .env 확인)');
		expect(err.status).toBeUndefined();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("C3 base가 빈 문자열('')이어도 fetch 없이 같은 에러로 reject 한다", async () => {
		vi.stubEnv('VITE_API_BASE_URL', '');
		const err = await request('/x').catch((e) => e);
		expect(err.message).toBe('VITE_API_BASE_URL이 설정되지 않았습니다 (루트 .env 확인)');
		expect(err.status).toBeUndefined();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('request - init', () => {
	it('C4 기본 요청은 GET + credentials include 만 담는다', async () => {
		await request('/x');
		const [, init] = fetchMock.mock.calls[0];
		expect(init).toStrictEqual({ method: 'GET', credentials: 'include' });
	});

	it('C8 JSON body는 Content-Type 헤더와 직렬화된 body를 담는다', async () => {
		await request('/x', { method: 'POST', body: { a: 1, b: '가' } });
		const [, init] = fetchMock.mock.calls[0];
		expect(init).toStrictEqual({
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ a: 1, b: '가' })
		});
	});

	it('C9 FormData body는 그대로 넘기고 Content-Type 헤더를 지정하지 않는다', async () => {
		const fd = new FormData();
		fd.append('k', 'v');
		await request('/x', { method: 'POST', body: fd });
		const [, init] = fetchMock.mock.calls[0];
		expect(init.body).toBe(fd);
		expect('headers' in init).toBe(false);
	});
});

describe('request - query', () => {
	it('C5 query를 직렬화하고 undefined/null은 제외하며 한글을 인코딩한다', async () => {
		await request('/x', {
			query: { page: 1, search: '한글', skip: undefined, none: null, flag: false }
		});
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe(`${BASE}/x?page=1&search=${encodeURIComponent('한글')}&flag=false`);
	});

	it('C6 남은 query 항목이 없으면 ? 를 붙이지 않는다', async () => {
		await request('/x', { query: { a: undefined, b: null } });
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe(`${BASE}/x`);
	});

	it("C7 빈 문자열('')은 제외하지 않고 유지한다", async () => {
		await request('/x', { query: { search: '' } });
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe(`${BASE}/x?search=`);
	});
});

describe('request - 성공 응답', () => {
	it('C10 JSON 응답은 파싱된 객체를 반환한다', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ data: [1, 2] }));
		await expect(request('/x')).resolves.toEqual({ data: [1, 2] });
	});

	it('C11 Content-Type이 application/json; charset=utf-8 이어도 JSON으로 파싱한다', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response('{"a":1}', {
				status: 200,
				headers: { 'Content-Type': 'application/json; charset=utf-8' }
			})
		);
		await expect(request('/x')).resolves.toEqual({ a: 1 });
	});

	it('C12 JSON이 아닌 응답은 Blob으로 반환한다', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response('abc', { status: 200, headers: { 'Content-Type': 'application/octet-stream' } })
		);
		const result = await request('/x');
		expect(result).toBeInstanceOf(Blob);
		expect(await result.text()).toBe('abc');
	});
});

describe('request - 에러 응답', () => {
	it('C13 401 + 서버 메시지는 Error(message)와 status로 던진다', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({ error: { message: '로그인이 필요합니다' } }, 401)
		);
		const err = await request('/x').catch((e) => e);
		expect(err).toBeInstanceOf(Error);
		expect(err.message).toBe('로그인이 필요합니다');
		expect(err.status).toBe(401);
	});

	it('C14 409 + 서버 메시지도 같은 방식으로 던진다', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: '버전 충돌' } }, 409));
		const err = await request('/x').catch((e) => e);
		expect(err.message).toBe('버전 충돌');
		expect(err.status).toBe(409);
	});

	it("C15 500 {status:'error'} 처럼 메시지가 없으면 'HTTP 500'", async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'error' }, 500));
		const err = await request('/x').catch((e) => e);
		expect(err.message).toBe('HTTP 500');
		expect(err.status).toBe(500);
	});

	it("C16 text/html 502는 'HTTP 502'", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response('<html>Bad Gateway</html>', {
				status: 502,
				headers: { 'Content-Type': 'text/html' }
			})
		);
		const err = await request('/x').catch((e) => e);
		expect(err.message).toBe('HTTP 502');
		expect(err.status).toBe(502);
	});

	it("C17 깨진 JSON 500은 'HTTP 500'", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response('{broken', { status: 500, headers: { 'Content-Type': 'application/json' } })
		);
		const err = await request('/x').catch((e) => e);
		expect(err.message).toBe('HTTP 500');
		expect(err.status).toBe(500);
	});

	it('C18 네트워크 실패는 같은 TypeError 인스턴스로 reject 하고 콘솔에 찍지 않는다', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const networkError = new TypeError('Failed to fetch');
		fetchMock.mockRejectedValueOnce(networkError);
		const err = await request('/x').catch((e) => e);
		expect(err).toBe(networkError);
		expect(err.status).toBeUndefined();
		expect(consoleError).not.toHaveBeenCalled();
	});
});
