import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildBullMqConnectionFromUrl } from './connection';

describe('buildBullMqConnectionFromUrl', () => {
  it('parses host and port from a plain redis URL', () => {
    const options = buildBullMqConnectionFromUrl('redis://127.0.0.1:6380');
    assert.equal(options.host, '127.0.0.1');
    assert.equal(options.port, 6380);
    assert.equal(options.maxRetriesPerRequest, null);
    assert.equal(options.password, undefined);
    assert.equal(options.tls, undefined);
  });

  it('includes password and username from the URL', () => {
    const options = buildBullMqConnectionFromUrl(
      'redis://alice:secret%40word@redis.example.com:6379',
    );
    assert.equal(options.host, 'redis.example.com');
    assert.equal(options.port, 6379);
    assert.equal(options.username, 'alice');
    assert.equal(options.password, 'secret@word');
  });

  it('enables TLS for rediss URLs', () => {
    const options = buildBullMqConnectionFromUrl('rediss://:token@kv.example.com:6380');
    assert.equal(options.host, 'kv.example.com');
    assert.equal(options.port, 6380);
    assert.equal(options.password, 'token');
    assert.deepEqual(options.tls, {});
  });
});
