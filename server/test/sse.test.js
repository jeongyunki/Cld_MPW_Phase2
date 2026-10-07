// BE-6 lib/sse.js 단위 테스트 (node:test, app·DB 없음)
//
// SSE(Server-Sent Events)란?
// - "라디오 방송"을 떠올리면 쉽다. 청취자(브라우저)가 한 번 주파수를 맞추면(연결),
//   방송국(서버)은 연결을 끊지 않고 소식이 생길 때마다 계속 흘려보낸다.
// - 청취자는 말을 걸 수 없고 듣기만 한다(서버 -> 브라우저 단방향).
// - 소식이 없는 동안에도 30초마다 ': ping' 신호(heartbeat)를 보내 "방송 중"임을 알린다.
//
// 왜 진짜 req/res 대신 가짜를 쓰는가?
// - lib/sse.js는 req.on('close'), res.writeHead / flushHeaders / write 만 쓴다.
//   그래서 EventEmitter와 간단한 객체로 충분하고, 네트워크 없이 보낸 바이트만 정확히 검증할 수 있다.
// - heartbeat는 t.mock.timers로 시간을 가짜로 흘려 보낸다. 실제로 30초를 기다리지 않는다.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const sse = require('../src/lib/sse');

const fakeReq = () => new EventEmitter();
const fakeRes = () => {
	const r = { head: null, flushed: 0, chunks: [] };
	r.writeHead = (status, headers) => {
		r.head = { status, headers };
	};
	r.flushHeaders = () => {
		r.flushed += 1;
	};
	r.write = (c) => {
		r.chunks.push(c);
		return true;
	};
	return r;
};

// 클라이언트를 만들어 연결하고, 정리용 close()를 함께 돌려준다.
const connect = () => {
	const req = fakeReq();
	const res = fakeRes();
	sse.addClient(req, res);
	return { req, res, close: () => req.emit('close') };
};
// 연결 직후의 ': connected' 한 줄을 뺀 나머지
const received = (client) => client.res.chunks.slice(1);

test('S1: addClient — 200 + SSE 헤더, flush 1회, ": connected", 등록 후 close 하면 제거', () => {
	const { req, res } = connect();
	assert.deepEqual(res.head, {
		status: 200,
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
	assert.equal(res.flushed, 1);
	assert.equal(res.chunks[0], ': connected\n\n');
	assert.equal(sse.clientCount(), 1);
	req.emit('close');
	assert.equal(sse.clientCount(), 0);
});

test('S2: broadcast — 모든 클라이언트가 정확히 같은 바이트를 받음 (객체, 배열, {id})', () => {
	const a = connect();
	const b = connect();
	try {
		sse.broadcast('created', { id: 'a', owner: '홍길동' });
		sse.broadcast('bulk-confirmed', [{ id: 'a' }, { id: 'b' }]);
		sse.broadcast('deleted', { id: 'a' });
		const expected = [
			'event: created\ndata: {"id":"a","owner":"홍길동"}\n\n',
			'event: bulk-confirmed\ndata: [{"id":"a"},{"id":"b"}]\n\n',
			'event: deleted\ndata: {"id":"a"}\n\n'
		];
		assert.deepEqual(received(a), expected);
		assert.deepEqual(received(b), expected);
	} finally {
		a.close();
		b.close();
	}
	assert.equal(sse.clientCount(), 0);
});

test('S3: 연결이 끊긴 클라이언트에는 보내지 않고, 나머지는 계속 받음', () => {
	const a = connect();
	const b = connect();
	try {
		a.close();
		assert.equal(sse.clientCount(), 1);
		sse.broadcast('updated', { id: 'x' });
		assert.deepEqual(received(a), []);
		assert.deepEqual(received(b), ['event: updated\ndata: {"id":"x"}\n\n']);
	} finally {
		a.close();
		b.close();
	}
	assert.equal(sse.clientCount(), 0);
});

test('S4: 클라이언트가 0개일 때 broadcast·sendHeartbeat는 에러 없이 지나감', () => {
	assert.equal(sse.clientCount(), 0);
	assert.doesNotThrow(() => sse.broadcast('created', { id: 'a' }));
	assert.doesNotThrow(() => sse.sendHeartbeat());
});

test('S5: sendHeartbeat — 모든 클라이언트에 ": ping" 주석 한 줄', () => {
	const a = connect();
	const b = connect();
	try {
		sse.sendHeartbeat();
		assert.deepEqual(received(a), [': ping\n\n']);
		assert.deepEqual(received(b), [': ping\n\n']);
	} finally {
		a.close();
		b.close();
	}
	assert.equal(sse.clientCount(), 0);
});

test('S6: HEARTBEAT_INTERVAL_MS는 30000', () => {
	assert.equal(sse.HEARTBEAT_INTERVAL_MS, 30000);
});

test('S7: heartbeat 타이머 — 30초마다 ping, 클라이언트가 0개면 멈추고 다시 연결하면 재시작', (t) => {
	// addClient가 첫 클라이언트에서 setInterval을 만들기 때문에, 그 전에 가짜 타이머를 켠다.
	t.mock.timers.enable({ apis: ['setInterval'] });
	const pings = (client) => received(client).filter((c) => c === ': ping\n\n').length;
	const a = connect();
	const b = connect();
	try {
		t.mock.timers.tick(sse.HEARTBEAT_INTERVAL_MS - 1);
		assert.equal(pings(a), 0);
		assert.equal(pings(b), 0);

		t.mock.timers.tick(1);
		assert.equal(pings(a), 1);
		assert.equal(pings(b), 1);

		t.mock.timers.tick(sse.HEARTBEAT_INTERVAL_MS * 2);
		assert.equal(pings(a), 3);
		assert.equal(pings(b), 3);

		// 하나가 나가도 타이머는 계속 돌고, 남은 쪽만 ping을 받는다.
		a.close();
		t.mock.timers.tick(sse.HEARTBEAT_INTERVAL_MS);
		assert.equal(pings(a), 3);
		assert.equal(pings(b), 4);

		// 모두 나가면 타이머가 멈춘다. (같은 res를 다시 등록하지 않고 기록만 확인)
		b.close();
		assert.equal(sse.clientCount(), 0);
		t.mock.timers.tick(sse.HEARTBEAT_INTERVAL_MS * 3);
		assert.equal(pings(a), 3);
		assert.equal(pings(b), 4);

		// 다시 연결하면 타이머가 새로 시작된다.
		const c = connect();
		try {
			t.mock.timers.tick(sse.HEARTBEAT_INTERVAL_MS);
			assert.equal(pings(c), 1);
		} finally {
			c.close();
		}
	} finally {
		a.close();
		b.close();
	}
	assert.equal(sse.clientCount(), 0);
});

test('S8: data에 줄바꿈이 들어가도 JSON이 한 줄이라 event / data / 빈 줄 형식이 깨지지 않음', () => {
	const a = connect();
	try {
		sse.broadcast('updated', { id: 'a', module: '첫째 줄\n둘째 줄\n\n넷째 줄' });
		const [chunk] = received(a);
		assert.ok(chunk.endsWith('\n\n'));
		const lines = chunk.slice(0, -2).split('\n');
		assert.equal(lines.length, 2);
		assert.equal(lines[0], 'event: updated');
		assert.ok(lines[1].startsWith('data: '));
		assert.deepEqual(JSON.parse(lines[1].slice('data: '.length)), {
			id: 'a',
			module: '첫째 줄\n둘째 줄\n\n넷째 줄'
		});
	} finally {
		a.close();
	}
	assert.equal(sse.clientCount(), 0);
});
