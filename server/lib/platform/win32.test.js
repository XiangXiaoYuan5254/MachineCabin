import assert from 'node:assert/strict';
import test from 'node:test';
import { commandLineMentions, parseListeningPorts, parseProcessSnapshot } from './win32.js';

test('reads listening TCP ports from netstat regardless of the display language', () => {
  const output = [
    '',
    '活动连接',
    '',
    '  协议  本地地址          外部地址        状态           PID',
    '  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1004',
    '  TCP    127.0.0.1:5173         0.0.0.0:0              ABHÖREN         4312',
    '  TCP    127.0.0.1:5173         127.0.0.1:52011        ESTABLISHED     4312',
    '  TCP    127.0.0.1:52011        127.0.0.1:5173         ESTABLISHED     7788',
    '  TCP    [::1]:5173             [::]:0                 LISTENING       4312',
    '  TCP    [::]:8080              [::]:0                 LISTENING       9001',
    '  TCP    10.0.0.2:50100         20.1.1.1:10            TIME_WAIT       0',
    '  UDP    0.0.0.0:5353           *:*                                    2345',
  ].join('\r\n');
  const ports = parseListeningPorts(output);
  assert.deepEqual([...ports.get(5173)], [4312]);
  assert.deepEqual([...ports.get(8080)], [9001]);
  assert.deepEqual([...ports.get(135)], [1004]);
  assert.equal(ports.has(52011), false);
  assert.equal(ports.has(50100), false);
  assert.equal(ports.has(5353), false);
});

test('parses the PowerShell process snapshot, including a single-object result and BOM', () => {
  const many = parseProcessSnapshot(JSON.stringify([
    { pid: 4, ppid: 0, started: '638000000000000000', commandLine: null, executable: null },
    { pid: 4312, ppid: 4200, started: '638000000000000123', commandLine: 'node vite.js', executable: 'C:\\node.exe' },
  ]));
  assert.equal(many.get(4312).started, '638000000000000123');
  assert.equal(many.get(4).commandLine, '');

  const single = parseProcessSnapshot(`\uFEFF${JSON.stringify({ pid: 12, ppid: 1, started: '1', commandLine: 'x', executable: '' })}`);
  assert.equal(single.get(12).commandLine, 'x');
  assert.equal(parseProcessSnapshot('').size, 0);
});

test('matches a service directory inside a command line without matching sibling folders', () => {
  const directory = 'C:\\Users\\me\\Projects\\order-api';
  assert.ok(commandLineMentions('"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\Me\\Projects\\order-api\\node_modules\\vite\\bin\\vite.js"', directory));
  assert.ok(commandLineMentions('node c:/users/me/projects/order-api/server.js', directory));
  assert.ok(commandLineMentions('C:\\Users\\me\\Projects\\order-api', `${directory}\\`));
  assert.equal(commandLineMentions('node C:\\Users\\me\\Projects\\order-api-v2\\server.js', directory), false);
  assert.equal(commandLineMentions('python manage.py runserver', directory), false);
  assert.equal(commandLineMentions('', directory), false);
});
