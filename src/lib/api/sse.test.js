// Vitest 테스트 — sse.js가 EventSource 연결 하나를 공유하고, 이벤트·연결 상태를 구독자에게 전달하는지 확인한다.
// Node에는 EventSource가 없으므로 같은 모양의 가짜 클래스를 vi.stubGlobal로 끼워 넣는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeImgagongStream } from './sse.js';

const BASE = 'http://api.test/api';

class FakeEventSource {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSED = 2;
	static instances = [];

	constructor(url, options) {
		this.url = url;
		this.options = options;
		this.readyState = FakeEventSource.CONNECTING;
		this.listeners = {};
		this.closed = false;
		FakeEventSource.instances.push(this);
	}
	addEventListener(name, fn) {
		this.listeners[name] = fn;
	}
	close() {
		this.closed = true;
	}
	// 테스트에서 서버 이벤트를 흉내 낸다
	emit(name, data) {
		this.listeners[name]({ data: JSON.stringify(data) });
	}
}

let unsubscribers;

beforeEach(() => {
	vi.stubEnv('VITE_API_BASE_URL', `${BASE}/`);
	vi.stubGlobal('EventSource', FakeEventSource);
	FakeEventSource.instances = [];
	unsubscribers = [];
});

afterEach(() => {
	// 모듈 수준 연결이 다음 테스트로 새지 않도록 모두 해제한다
	for (const off of unsubscribers) off();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

const subscribe = (handlers) => {
	const off = subscribeImgagongStream(handlers);
	unsubscribers.push(off);
	return off;
};

describe('subscribeImgagongStream', () => {
	it('S1 스트림 URL에 쿠키 포함(withCredentials)으로 연결한다 (base 끝의 / 는 제거)', () => {
		subscribe({ onEvent: vi.fn() });
		const [source] = FakeEventSource.instances;
		expect(source.url).toBe(`${BASE}/imgagong-plans/stream`);
		expect(source.options).toStrictEqual({ withCredentials: true });
	});

	it('S2 구독자가 둘이어도 연결은 하나만 연다', () => {
		subscribe({ onEvent: vi.fn() });
		subscribe({ onEvent: vi.fn() });
		expect(FakeEventSource.instances).toHaveLength(1);
	});

	it('S3 4가지 이벤트를 JSON으로 파싱해 모든 구독자에게 전달한다', () => {
		const a = vi.fn();
		const b = vi.fn();
		subscribe({ onEvent: a });
		subscribe({ onEvent: b });
		const [source] = FakeEventSource.instances;
		source.emit('created', { id: '1' });
		source.emit('updated', { id: '1', version: 2 });
		source.emit('deleted', { id: '1' });
		source.emit('bulk-confirmed', [{ id: '2' }]);
		expect(a.mock.calls).toStrictEqual([
			['created', { id: '1' }],
			['updated', { id: '1', version: 2 }],
			['deleted', { id: '1' }],
			['bulk-confirmed', [{ id: '2' }]]
		]);
		expect(b).toHaveBeenCalledTimes(4);
	});

	it('S4 연결 상태: open → open, 재연결 중 → reconnecting, 포기 → closed', () => {
		const onStatus = vi.fn();
		subscribe({ onEvent: vi.fn(), onStatus });
		subscribe({ onEvent: vi.fn() }); // onStatus가 없는 구독자도 에러 없이 넘어간다
		const [source] = FakeEventSource.instances;
		source.onopen();
		source.readyState = FakeEventSource.CONNECTING;
		source.onerror();
		source.readyState = FakeEventSource.CLOSED;
		source.onerror();
		expect(onStatus.mock.calls).toStrictEqual([['open'], ['reconnecting'], ['closed']]);
	});

	it('S5 마지막 구독자가 해제할 때만 연결을 닫고, 다시 구독하면 새로 연다', () => {
		const offA = subscribe({ onEvent: vi.fn() });
		const offB = subscribe({ onEvent: vi.fn() });
		const [first] = FakeEventSource.instances;
		offA();
		expect(first.closed).toBe(false);
		offB();
		expect(first.closed).toBe(true);
		offB(); // 두 번 해제해도 문제없다

		subscribe({ onEvent: vi.fn() });
		expect(FakeEventSource.instances).toHaveLength(2);
	});

	it('S6 해제한 구독자에게는 더 이상 이벤트를 보내지 않는다', () => {
		const a = vi.fn();
		const offA = subscribe({ onEvent: a });
		subscribe({ onEvent: vi.fn() });
		offA();
		FakeEventSource.instances[0].emit('created', { id: '1' });
		expect(a).not.toHaveBeenCalled();
	});

	it('S7 VITE_API_BASE_URL이 없으면 에러를 던진다', () => {
		vi.stubEnv('VITE_API_BASE_URL', '');
		expect(() => subscribeImgagongStream({ onEvent: vi.fn() })).toThrow('VITE_API_BASE_URL');
	});
});
