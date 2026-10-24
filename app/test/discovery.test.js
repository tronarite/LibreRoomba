// Las pruebas usan SOLO sockets UDP en 127.0.0.1 (respondedor falso): nunca tocan la red real.
const test = require('node:test');
const assert = require('node:assert/strict');
const dgram = require('dgram');
const { discover, parseReply } = require('../core/discovery');

const reply = (over = {}) => JSON.stringify({ ver: '2', hostname: 'Roomba-ABCDEF0123456789', robotname: 'Test', ip: '10.9.8.7', mac: 'AA:BB:CC:DD:EE:FF', sw: 'v1', sku: 'x', proto: 'mqtt', ...over });

// Respondedor UDP en loopback: contesta a `irobotmcs` con las respuestas dadas (en orden). Devuelve { port, received, close }.
async function fakeRobot(replies) {
  const server = dgram.createSocket('udp4');
  const received = [];
  server.on('message', (msg, rinfo) => {
    received.push(String(msg));
    for (const r of replies) server.send(Buffer.from(r), rinfo.port, rinfo.address);
  });
  await new Promise((resolve) => server.bind(0, '127.0.0.1', resolve));
  return { port: server.address().port, received, close: () => new Promise((resolve) => server.close(resolve)) };
}
const opts = (robot, extra = {}) => ({ address: '127.0.0.1', port: robot.port, bindPort: 0, timeoutMs: 800, ...extra });

test('parseReply: acepta Roomba-/iRobot- y descarta basura', () => {
  assert.equal(parseReply(reply()).blid, 'ABCDEF0123456789');
  assert.equal(parseReply(reply({ hostname: 'iRobot-XYZ' })).blid, 'XYZ');
  assert.equal(parseReply(reply({ hostname: 'Otro-AAA' })), null);
  assert.equal(parseReply(reply({ hostname: 'Roomba' })), null);
  assert.equal(parseReply('no es json'), null);
  assert.equal(parseReply(JSON.stringify({ hostname: 'Roomba-A' })), null, 'sin ip');
  assert.equal(parseReply(''), null);
});

test('encuentra el robot, envía exactamente `irobotmcs` y devuelve su IP', async () => {
  const robot = await fakeRobot([reply()]);
  const found = await discover(opts(robot));
  await robot.close();
  assert.equal(found.ip, '10.9.8.7');
  assert.equal(found.blid, 'ABCDEF0123456789');
  assert.deepEqual(robot.received, ['irobotmcs']);
});

test('filtra por BLID (sin importar mayúsculas) y por MAC (con o sin separadores)', async () => {
  const other = reply({ hostname: 'Roomba-OTRO000000000000', ip: '10.9.8.99', mac: '11:22:33:44:55:66' });
  const robot = await fakeRobot([other, reply()]);
  assert.equal((await discover(opts(robot, { blid: 'abcdef0123456789' }))).ip, '10.9.8.7');
  assert.equal((await discover(opts(robot, { mac: 'aabbccddeeff' }))).ip, '10.9.8.7');
  assert.equal((await discover(opts(robot, { mac: '11-22-33-44-55-66' }))).ip, '10.9.8.99');
  await robot.close();
});

test('timeout: sin respuesta o sin coincidencia devuelve null (no cuelga ni lanza)', async () => {
  const mute = await fakeRobot([]);
  const t0 = Date.now();
  assert.equal(await discover(opts(mute, { timeoutMs: 150 })), null);
  assert.ok(Date.now() - t0 < 1000);
  await mute.close();
  const wrong = await fakeRobot([reply({ hostname: 'Roomba-DISTINTO', mac: '00:00:00:00:00:01' })]);
  assert.equal(await discover(opts(wrong, { blid: 'ABCDEF0123456789', timeoutMs: 200 })), null);
  await wrong.close();
});

test('ignora datagramas que no son de un robot y sigue esperando al bueno', async () => {
  const robot = await fakeRobot(['basura', '{"hola":1}', reply()]);
  const found = await discover(opts(robot));
  await robot.close();
  assert.equal(found.ip, '10.9.8.7');
});

test('dgram inyectable: errores de socket y de envío se convierten en null', async () => {
  const { EventEmitter } = require('events');
  const broken = (where) => ({ createSocket: () => Object.assign(new EventEmitter(), {
    bind: (_p, cb) => (where === 'bind' ? setImmediate(() => { throw new Error('x'); }) && undefined : setImmediate(cb)),
    setBroadcast() {}, close() {},
    send: (_b, _p, _a, cb) => (where === 'send' ? cb(new Error('EHOSTUNREACH')) : undefined)
  }) });
  assert.equal(await discover({ dgram: broken('send'), timeoutMs: 300 }), null);
  const throwing = { createSocket: () => { throw new Error('sin udp'); } };
  assert.equal(await discover({ dgram: throwing, timeoutMs: 300 }), null);
});

test('puerto local ocupado (EADDRINUSE): reintenta con puerto efímero', async () => {
  const robot = await fakeRobot([reply()]);
  const squatter = dgram.createSocket({ type: 'udp4', reuseAddr: false });
  await new Promise((resolve) => squatter.bind(0, '0.0.0.0', resolve));
  const busyPort = squatter.address().port;
  const found = await discover(opts(robot, { bindPort: busyPort }));
  squatter.close();
  await robot.close();
  assert.equal(found && found.ip, '10.9.8.7');
});
