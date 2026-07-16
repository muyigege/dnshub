import { describe, it, expect } from 'vitest';
import {
  toRelativeRecordName,
  toFqdnRecordName,
  normalizeDomainName,
  ttlOrDefault,
  splitRecordId,
  ok,
  fail,
  mapPriority,
  escapeXml,
  decodeXml,
  getXmlTag,
} from './utils';

describe('normalizeDomainName', () => {
  it('去除尾部点并转小写', () => {
    expect(normalizeDomainName('Example.COM.')).toBe('example.com');
    expect(normalizeDomainName('Foo.Bar')).toBe('foo.bar');
  });

  it('无尾部点时仅转小写', () => {
    expect(normalizeDomainName('example.com')).toBe('example.com');
  });
});

describe('toRelativeRecordName', () => {
  const domain = 'example.com';

  it('@ 返回 @', () => {
    expect(toRelativeRecordName('@', domain)).toBe('@');
  });

  it('空字符串返回 @', () => {
    expect(toRelativeRecordName('', domain)).toBe('@');
  });

  it('FQDN（等于域名）返回 @', () => {
    expect(toRelativeRecordName('example.com', domain)).toBe('@');
    expect(toRelativeRecordName('Example.COM.', domain)).toBe('@');
  });

  it('FQDN（带域名后缀）返回相对名', () => {
    expect(toRelativeRecordName('www.example.com', domain)).toBe('www');
    expect(toRelativeRecordName('api.example.com', domain)).toBe('api');
  });

  it('FQDN 带尾部点也能归一化', () => {
    expect(toRelativeRecordName('www.example.com.', domain)).toBe('www');
  });

  it('已经是相对名时原样返回', () => {
    expect(toRelativeRecordName('www', domain)).toBe('www');
    expect(toRelativeRecordName('sub.www', domain)).toBe('sub.www');
  });

  it('大小写不敏感', () => {
    expect(toRelativeRecordName('WWW.Example.COM', domain)).toBe('WWW');
  });
});

describe('toFqdnRecordName', () => {
  const domain = 'example.com';

  it('@ 返回完整域名', () => {
    expect(toFqdnRecordName('@', domain)).toBe('example.com');
  });

  it('空字符串返回完整域名', () => {
    expect(toFqdnRecordName('', domain)).toBe('example.com');
  });

  it('相对名拼接域名', () => {
    expect(toFqdnRecordName('www', domain)).toBe('www.example.com');
    expect(toFqdnRecordName('api', domain)).toBe('api.example.com');
  });

  it('已是 FQDN 时原样返回（归一化）', () => {
    expect(toFqdnRecordName('www.example.com', domain)).toBe('www.example.com');
    expect(toFqdnRecordName('www.example.com.', domain)).toBe('www.example.com');
  });

  it('大小写不敏感', () => {
    expect(toFqdnRecordName('WWW', domain)).toBe('WWW.example.com');
  });
});

describe('toRelativeRecordName 与 toFqdnRecordName 互逆', () => {
  const domain = 'example.com';
  const cases = ['@', 'www', 'api', 'sub.www', 'a.b.c'];

  for (const rel of cases) {
    it(`相对名 "${rel}" → FQDN → 相对名 应还原`, () => {
      const fqdn = toFqdnRecordName(rel, domain);
      const back = toRelativeRecordName(fqdn, domain);
      expect(back).toBe(rel === '@' ? '@' : rel);
    });
  }
});

describe('ttlOrDefault', () => {
  it('有效 ttl 原样返回', () => {
    expect(ttlOrDefault(300)).toBe(300);
    expect(ttlOrDefault(3600)).toBe(3600);
  });

  it('undefined/0/负数 返回 fallback', () => {
    expect(ttlOrDefault(undefined)).toBe(600);
    expect(ttlOrDefault(0)).toBe(600);
    expect(ttlOrDefault(-1)).toBe(600);
  });

  it('自定义 fallback', () => {
    expect(ttlOrDefault(undefined, 300)).toBe(300);
  });
});

describe('splitRecordId', () => {
  it('正常拆分 type:name', () => {
    expect(splitRecordId('A:www')).toEqual({ type: 'A', name: 'www' });
  });

  it('name 含冒号时正确合并', () => {
    expect(splitRecordId('CNAME:www:extra')).toEqual({ type: 'CNAME', name: 'www:extra' });
  });

  it('无冒号时整个字符串作为 type、name 默认 @', () => {
    // 'onlyname'.split(':') = ['onlyname']，destructuring 使 type='onlyname'、nameParts=[]
    expect(splitRecordId('onlyname')).toEqual({ type: 'onlyname', name: '@' });
    expect(splitRecordId('')).toEqual({ type: '', name: '@' });
  });
});

describe('ok / fail', () => {
  it('ok 无数据', () => {
    expect(ok()).toEqual({ success: true });
  });

  it('ok 带数据', () => {
    expect(ok({ id: 1 })).toEqual({ success: true, data: { id: 1 } });
  });

  it('fail 包装 Error', () => {
    const result = fail(new Error('boom'), 'fallback');
    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });

  it('fail 包装字符串', () => {
    const result = fail('something', 'fallback');
    expect(result.success).toBe(false);
    expect(result.error).toBe('something');
  });

  it('fail 空值用 fallback', () => {
    const result = fail(null, 'fallback');
    expect(result.success).toBe(false);
    expect(result.error).toBe('fallback');
  });
});

describe('mapPriority', () => {
  it('MX 返回 priority', () => {
    expect(mapPriority({ type: 'MX', priority: 10 })).toBe(10);
  });

  it('SRV 返回 priority', () => {
    expect(mapPriority({ type: 'SRV', priority: 20 })).toBe(20);
  });

  it('A/其他类型返回 undefined', () => {
    expect(mapPriority({ type: 'A', priority: 10 })).toBeUndefined();
    expect(mapPriority({ type: 'TXT' })).toBeUndefined();
  });
});

describe('XML 工具', () => {
  it('escapeXml 转义特殊字符', () => {
    expect(escapeXml('<a>&"\'</a>')).toBe('&lt;a&gt;&amp;&quot;&apos;&lt;/a&gt;');
  });

  it('escapeXml 处理 null/undefined', () => {
    expect(escapeXml(null)).toBe('');
    expect(escapeXml(undefined)).toBe('');
  });

  it('decodeXml 还原转义', () => {
    expect(decodeXml('&lt;a&gt;&amp;&quot;&apos;')).toBe('<a>&"\'');
  });

  it('getXmlTag 提取标签内容', () => {
    const xml = '<root><name>hello</name><value>world</value></root>';
    expect(getXmlTag(xml, 'name')).toBe('hello');
    expect(getXmlTag(xml, 'value')).toBe('world');
    expect(getXmlTag(xml, 'missing')).toBe('');
  });
});
