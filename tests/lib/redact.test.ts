import { describe, it, expect } from 'vitest';
import { redactSecrets } from '@/lib/redact';

describe('redactSecrets', () => {
  it('OpenAI 스타일 키를 마스킹한다', () => {
    expect(redactSecrets('key sk-abc123XYZ789 invalid')).toBe('key [REDACTED] invalid');
    expect(redactSecrets('key sk-proj-abc_123-XYZ invalid')).toBe('key [REDACTED] invalid');
  });

  it('OpenAI가 부분 마스킹해서 돌려주는 키도 마스킹한다', () => {
    expect(redactSecrets('Incorrect API key provided: sk-abc***XYZ.')).toBe(
      'Incorrect API key provided: [REDACTED].'
    );
  });

  it('Bearer 토큰을 마스킹한다', () => {
    expect(redactSecrets('Authorization: Bearer abc.def-123')).toBe('Authorization: Bearer [REDACTED]');
  });

  it('비밀이 없는 문장은 그대로 둔다', () => {
    expect(redactSecrets('Tool not found in registry: "update_ad"')).toBe('Tool not found in registry: "update_ad"');
  });

  it('한 문장에 여러 개가 있어도 모두 마스킹한다', () => {
    const out = redactSecrets('a sk-first1234 b sk-second5678');
    expect(out).toBe('a [REDACTED] b [REDACTED]');
  });
});
