const test = require('node:test');
const assert = require('node:assert/strict');
const { sign } = require('../core/sigv4');

// Vector oficial de la suite de pruebas de AWS SigV4: get-vanilla (credenciales de ejemplo públicas de la documentación de AWS)
test('SigV4: vector oficial get-vanilla', () => {
  const headers = sign({
    method: 'GET', url: 'https://example.amazonaws.com/', region: 'us-east-1', service: 'service',
    credentials: { AccessKeyId: 'AKIDEXAMPLE', SecretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' },
    now: new Date('2015-08-30T12:36:00Z')
  });
  assert.equal(headers['x-amz-date'], '20150830T123600Z');
  assert.equal(headers.authorization,
    'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
});

test('SigV4: con token de sesión se firma x-amz-security-token y la consulta se ordena', () => {
  const h = sign({
    url: 'https://auth3.example.test/v1/X/pmaps?visible=true&activeDetails=2',
    credentials: { AccessKeyId: 'AK', SecretKey: 'SK', SessionToken: 'TOK' }, now: new Date('2026-01-02T03:04:05Z')
  });
  assert.equal(h['x-amz-security-token'], 'TOK');
  assert.match(h.authorization, /SignedHeaders=host;x-amz-date;x-amz-security-token,/);
  const reordered = sign({ url: 'https://auth3.example.test/v1/X/pmaps?activeDetails=2&visible=true', credentials: { AccessKeyId: 'AK', SecretKey: 'SK', SessionToken: 'TOK' }, now: new Date('2026-01-02T03:04:05Z') });
  assert.equal(reordered.authorization, h.authorization, 'el orden de los parámetros no cambia la firma');
});
