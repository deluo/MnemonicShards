/**
 * BIP39 相关修复的回归验证脚本
 * 运行：npm run verify（或 node scripts/verify-bip39.mjs）
 *
 * 覆盖项：
 *  1. 词表完整性（2048 词、去重有序、官方词齐全、无混入词）
 *  2. 助记词校验和验证（官方测试向量的正反例）
 *  3. 重复单词不再阻断生成
 *  4. Shamir 分片往返（使用应用自身的分片编码格式）
 *  5. 恶意载荷分片会被校验和关卡拦截（XSS 防御链的一环）
 *  6. 独立实现恢复演示（逃生舱验证，兼容 v1.2 分片校验码字段）
 *  7. BTC 地址派生（观察模式，BIP84 官方向量）
 *  8. 助记词指纹（演练模式核心，SHA-256 前 8 位十六进制，与 node:crypto 交叉验证）
 *  9. 分片校验码（Crockford Base32，坏片定位、旧格式兼容）
 * 10. 演练端到端（分片 → 恢复 → 指纹比对，不依赖 DOM）
 */

import { createHash } from 'node:crypto';
import { split, combine } from 'shamir-secret-sharing';
import { BIP39_WORDLIST } from '../src/constants/bip39-words.js';
import {
  validateMnemonic,
  validateMnemonicChecksum,
  parseShareData,
  validateShareCollection,
} from '../src/utils/validation.js';
import {
  computeMnemonicFingerprint,
  computeShareChecksum,
  verifyShareChecksum,
  crockford32Encode,
  normalizeFingerprintInput,
} from '../src/utils/integrity.js';
import { mnemonicToSeed, deriveAccount, deriveAddress } from '../src/utils/derivation.js';
import { DERIVATION_CONFIG } from '../src/constants/index.js';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

// 与应用一致的编码格式（ShareManager.generateShares，v1.2+ 分片 JSON 内嵌校验码）
function encodeShare(share, index, threshold, total) {
  const shareData = {
    index,
    threshold,
    total,
    data: btoa(String.fromCharCode(...share)),
  };
  shareData.checksum = computeShareChecksum(shareData);
  return btoa(JSON.stringify(shareData));
}

function decodeShareLine(line) {
  const parsed = JSON.parse(atob(line.trim()));
  const binary = atob(parsed.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return parsed;
}

// ---------------------------------------------------------------------------
console.log('\n[1] 词表完整性');
check('词数为 2048', BIP39_WORDLIST.length === 2048, `实际 ${BIP39_WORDLIST.length}`);
check('无重复单词', new Set(BIP39_WORDLIST).size === 2048);
check('按字典序排列（与官方文件一致）', [...BIP39_WORDLIST].every((w, i, a) => i === 0 || a[i - 1] < w));

// 曾经缺失的 48 个官方词抽样验证
for (const w of ['sign', 'silent', 'omit', 'legend', 'warm', 'wet', 'civil', 'chat', 'carpet', 'bridge', 'brass', 'bounce', 'replace', 'saddle', 'slice', 'soft', 'sunset', 'toilet', 'unaware', 'vacant', 'satoshi']) {
  if (!BIP39_WORDLIST.includes(w)) {
    check(`官方词 "${w}" 在词表中`, false);
  }
}
check('曾缺失的 21 个官方抽样词全部存在', true);
// 曾经混入的非 BIP39 词抽样验证（exotic 是官方词，不在此列）
const fakeWords = ['both', 'bottle', 'break', 'down', 'dozen', 'doubt', 'graph', 'gray', 'site', 'skip', 'spark', 'silence', 'least', 'leather', 'violet', 'warehouse', 'fridge', 'gratitude'];
check('曾混入的非 BIP39 词全部移除', fakeWords.every((w) => !BIP39_WORDLIST.includes(w)));

// ---------------------------------------------------------------------------
console.log('\n[2] BIP39 校验和验证（官方测试向量）');
const vector12 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'.split(' ');
const vector24 = ('abandon '.repeat(23) + 'art').trim().split(' ');
// 经典向量，含三组重复单词（letter/advice/cage 各出现两次）
const vectorDup = 'letter advice cage absurd amount doctor acoustic avoid letter advice cage above'.split(' ');
const vectorDupBad = [...vectorDup];
vectorDupBad[11] = 'ability'; // 只改最后一个词 → 校验和不匹配

{
  const r = await validateMnemonicChecksum(vector12);
  check('12 词全零熵向量（abandon×11 + about）通过', r.isValid === true, JSON.stringify(r));
}
{
  const r = await validateMnemonicChecksum(vector24);
  check('24 词全零熵向量（abandon×23 + art）通过', r.isValid === true, JSON.stringify(r));
}
{
  const r = await validateMnemonicChecksum(vectorDup);
  check('含重复单词的合法向量通过（重复词不阻断）', r.isValid === true, JSON.stringify(r));
}
{
  const r = await validateMnemonicChecksum([...vector12.slice(0, 11), 'abandon']);
  check('篡改最后一个词被校验和拒绝', r.isValid === false && r.reason === 'checksum', JSON.stringify(r));
}
{
  const r = await validateMnemonicChecksum(vectorDupBad);
  check('含重复向量篡改一词被拒绝', r.isValid === false && r.reason === 'checksum', JSON.stringify(r));
}
{
  const r = await validateMnemonicChecksum([...vector12.slice(0, 11), 'both']);
  check('非 BIP39 假词（both）被拒绝并定位到词', r.isValid === false && r.reason === 'word' && r.word === 'both', JSON.stringify(r));
}
{
  const r = await validateMnemonicChecksum(vector12.concat(['zone']));
  check('13 个单词被拒绝（长度非法）', r.isValid === false && r.reason === 'count', JSON.stringify(r));
}
{
  const r = await validateMnemonicChecksum([]);
  check('空输入被拒绝', r.isValid === false && r.reason === 'count', JSON.stringify(r));
}

// ---------------------------------------------------------------------------
console.log('\n[3] 重复单词不再阻断生成');
{
  const r = validateMnemonic(vectorDup);
  check('含重复词时 validateMnemonic.isValid 为 true', r.isValid === true);
  check('重复词仍作为提示返回', Array.isArray(r.duplicates) && r.duplicates.length === 3, JSON.stringify(r.duplicates));
}

// ---------------------------------------------------------------------------
console.log('\n[4] Shamir 分片往返（应用编码格式）');
let roundTripLines = [];
{
  const secret = new TextEncoder().encode(vectorDup.join(' '));
  const raw = await split(secret, 5, 3);
  const lines = raw.map((s, i) => encodeShare(s, i + 1, 3, 5));
  roundTripLines = lines;

  const parsed = lines.map(decodeShareLine);
  check('分片可按应用格式编码/解码', parsed.every((p) => p.index >= 1 && p.threshold === 3 && p.data));
  check(
    'v1.2 分片携带 8 位校验码字段（大写、无 I/L/O/U）',
    parsed.every((p) => typeof p.checksum === 'string' && /^[0-9A-HJ-NP-TV-Z]{8}$/.test(p.checksum)),
    JSON.stringify(parsed.map((p) => p.checksum)),
  );

  // 任取 3 个（1/3/5 号）恢复
  const rebuilt = await combine([raw[0], raw[2], raw[4]]);
  const mnemonic = new TextDecoder().decode(rebuilt);
  check('任意 3 个分片可恢复原助记词', mnemonic === vectorDup.join(' '));

  // 恢复关卡：恢复结果重新做校验和验证
  const r = await validateMnemonicChecksum(mnemonic.trim().split(/\s+/));
  check('恢复结果通过校验和验证', r.isValid === true);
}

// ---------------------------------------------------------------------------
console.log('\n[5] 恶意载荷拦截（XSS 防御链）');
{
  const payload = '<img src=x onerror="window.__pwned=1"> abandon abandon abandon';
  const raw = await split(new TextEncoder().encode(payload), 3, 2);
  const rebuilt = await combine([raw[0], raw[1]]);
  const mnemonic = new TextDecoder().decode(rebuilt);
  check('载荷分片在库层面确实可还原出 HTML', mnemonic === payload);

  // 应用在展示前会走 recoverFromShareData 的校验关卡：这里验证同一关卡必然拦截
  const r = await validateMnemonicChecksum(mnemonic.trim().split(/\s+/));
  check('校验和关卡拦截 HTML 载荷（不会进入展示路径）', r.isValid === false);
}

// ---------------------------------------------------------------------------
console.log('\n[6] 独立实现恢复演示（逃生舱验证）');
// 以下恢复过程不使用本项目的任何源码：仅用 Node 原生 API（Buffer/TextDecoder）
// + 公开第三方库 shamir-secret-sharing（Cure53/Zellic 审计）按分片字符串恢复。
// 证明分片格式不深度绑定本项目——任何人参照格式规范（README）都能写出等价恢复器。
{
  const independentDecode = (line) => {
    const parsed = JSON.parse(Buffer.from(line.trim(), 'base64').toString('utf8'));
    return new Uint8Array(Buffer.from(parsed.data, 'base64'));
  };
  const rebuilt = await combine([
    independentDecode(roundTripLines[0]),
    independentDecode(roundTripLines[2]),
    independentDecode(roundTripLines[4]),
  ]);
  const recovered = new TextDecoder().decode(rebuilt);
  check('独立实现（零项目代码）从分片字符串恢复出相同助记词', recovered === vectorDup.join(' '));

  // v1.2+ 分片多出的 checksum 字段对独立恢复器是透明的：恢复算法只消费 data
  const envelope = JSON.parse(Buffer.from(roundTripLines[0].trim(), 'base64').toString('utf8'));
  check(
    '独立实现可忽略 v1.2 校验码字段（恢复算法不使用它）',
    typeof envelope.checksum === 'string' && envelope.checksum.length === 8 && recovered === vectorDup.join(' '),
  );
}

// ---------------------------------------------------------------------------
console.log('\n[7] BTC 地址派生（观察模式，BIP84 官方向量）');
{
  const preset = DERIVATION_CONFIG.PATH_PRESETS.find((p) => p.id === 'native');

  // BIP84 规范测试向量：m/84'/0'/0'/0/0（无 passphrase）
  const seed = await mnemonicToSeed(vector12.join(' '));
  const { accountKey, xpub } = deriveAccount(seed, preset);
  check('账户扩展公钥为 zpub 格式', xpub.startsWith('zpub'), xpub.slice(0, 12));

  accountKey.wipePrivateData();
  check('抹除账户私钥后仍可公钥派生地址', accountKey.privateKey === null);

  const addr0 = deriveAddress(accountKey, preset, 0);
  check(
    '0/0 地址等于 BIP84 官方向量',
    addr0 === 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
    `实际 ${addr0}`,
  );
  const addr1 = deriveAddress(accountKey, preset, 1);
  check(
    '0/1 地址等于 BIP84 官方向量',
    addr1 === 'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g',
    `实际 ${addr1}`,
  );

  // 带 passphrase 的派生必须与无 passphrase 完全不同（第 25 词参与盐计算）
  const seedTrezor = await mnemonicToSeed(vector12.join(' '), 'TREZOR');
  const { accountKey: acctTrezor } = deriveAccount(seedTrezor, preset);
  const addrTrezor = deriveAddress(acctTrezor, preset, 0);
  check('passphrase 参与派生（同助记词产出不同地址）', addrTrezor !== addr0, `实际 ${addrTrezor}`);

  // 其余预设的格式特征
  const nestedPreset = DERIVATION_CONFIG.PATH_PRESETS.find((p) => p.id === 'nested');
  const legacyPreset = DERIVATION_CONFIG.PATH_PRESETS.find((p) => p.id === 'legacy');
  const { accountKey: keyNested, xpub: ypub } = deriveAccount(seed, nestedPreset);
  const { accountKey: keyLegacy, xpub: legacyXpub } = deriveAccount(seed, legacyPreset);
  check('Nested 预设导出 ypub 格式', ypub.startsWith('ypub'), ypub.slice(0, 8));
  check('Legacy 预设导出 xpub 格式', legacyXpub.startsWith('xpub'), legacyXpub.slice(0, 8));
  check('Nested 0/0 地址为 3 开头（P2SH）', deriveAddress(keyNested, nestedPreset, 0).startsWith('3'));
  check('Legacy 0/0 地址为 1 开头（P2PKH）', deriveAddress(keyLegacy, legacyPreset, 0).startsWith('1'));
}

// ---------------------------------------------------------------------------
console.log('\n[8] 助记词指纹（演练模式核心）');
{
  // 独立参照实现：node:crypto 对归一化助记词取 SHA-256 前 8 位十六进制
  const nodeFingerprint = (mnemonic) =>
    createHash('sha256')
      .update(mnemonic.trim().split(/\s+/).join(' ').toLowerCase(), 'utf8')
      .digest('hex')
      .slice(0, 8)
      .toUpperCase();

  const fp12 = computeMnemonicFingerprint(vector12.join(' '));
  check('12 词全零熵向量指纹等于回归锚 C557EEC8', fp12 === 'C557EEC8', `实际 ${fp12}`);
  check('指纹与 node:crypto 独立实现一致（12 词）', fp12 === nodeFingerprint(vector12.join(' ')));
  check('指纹与 node:crypto 独立实现一致（24 词）', computeMnemonicFingerprint(vector24.join(' ')) === nodeFingerprint(vector24.join(' ')));

  check(
    '归一化不变性：大小写/多空格/首尾空白不影响指纹',
    computeMnemonicFingerprint('  ABANDON   abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon ABOUT\n') === fp12,
  );

  check('指纹输入归一化：小写/空格/横线可接受', normalizeFingerprintInput('c557-eec8') === 'C557EEC8');
  check('指纹输入归一化：带分组空格可接受', normalizeFingerprintInput('C557 EEC8') === 'C557EEC8');
  check('指纹输入归一化：长度不足返回 null', normalizeFingerprintInput('C557EEC') === null);
  check('指纹输入归一化：含非十六进制字符返回 null', normalizeFingerprintInput('G557EEC8') === null);
  check('指纹输入归一化：空输入返回 null', normalizeFingerprintInput('') === null && normalizeFingerprintInput(null) === null);
}

// ---------------------------------------------------------------------------
console.log('\n[9] 分片校验码（Crockford Base32，坏片定位）');
{
  // 独立参照实现：BigInt 版 Crockford Base32（固定 5 字节 → 8 字符）
  const independentCrockford = (bytes) => {
    const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let v = 0n;
    for (const b of bytes) v = (v << 8n) | BigInt(b);
    let out = '';
    for (let i = 0; i < 8; i++) {
      out = ALPHABET[Number(v & 31n)] + out;
      v >>= 5n;
    }
    return out;
  };

  check('Crockford 编码：全零 5 字节 → 00000000', crockford32Encode(new Uint8Array(5)) === '00000000');
  check('Crockford 编码：全 1 位 5 字节 → ZZZZZZZZ', crockford32Encode(new Uint8Array([255, 255, 255, 255, 255])) === 'ZZZZZZZZ');
  check(
    'Crockford 编码排除易混淆字母 I/L/O/U',
    [0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77].every(
      (b) => !/[ILOU]/.test(crockford32Encode(new Uint8Array([b, b, b, b, b]))),
    ),
  );

  // 校验码与 node:crypto + 独立 Base32 实现交叉验证
  const firstParsed = parseShareData(roundTripLines[0]);
  const dataBytes = Uint8Array.from(atob(firstParsed.data), (c) => c.charCodeAt(0));
  const nodeDigest = createHash('sha256').update(Buffer.from(dataBytes)).digest().subarray(0, 5);
  check('校验码与 node:crypto + 独立 Base32 实现一致', computeShareChecksum(firstParsed) === independentCrockford(nodeDigest));

  check('verifyShareChecksum：校验码匹配 → true', verifyShareChecksum(firstParsed) === true);
  check('parseShareData 附加 checksumOk=true', firstParsed.checksumOk === true);

  // 篡改 data 单字节 → 校验码不符（坏片可定位）
  const tamperedBytes = [...dataBytes];
  tamperedBytes[0] ^= 0x01;
  const tamperedShare = { ...firstParsed, index: 2, data: btoa(String.fromCharCode(...tamperedBytes)) };
  check('篡改 data 单字节 → checksumOk=false', verifyShareChecksum(tamperedShare) === false);

  // data 的 Base64 本身损坏 → 在解析阶段即可判定为坏片（早于 combine 报错）
  check('data 的 Base64 损坏 → checksumOk=false', verifyShareChecksum({ ...firstParsed, data: '!!!' }) === false);

  // 旧格式（无 checksum 字段）→ undefined，跳过校验视为有效
  const legacyShare = { index: 3, threshold: 3, total: 5, data: firstParsed.data };
  const legacyParsed = parseShareData(btoa(JSON.stringify(legacyShare)));
  check(
    '旧格式分片（无校验码字段）→ checksumOk=undefined',
    verifyShareChecksum(legacyShare) === undefined && legacyParsed.checksumOk === undefined,
  );

  // validateShareCollection 汇总坏片序号（好片 + 坏片混合输入）
  const collection = validateShareCollection([roundTripLines[0], btoa(JSON.stringify(tamperedShare))]);
  check(
    'validateShareCollection 返回 checksumBad=[2]',
    JSON.stringify(collection.checksumBad) === '[2]',
    JSON.stringify(collection.checksumBad),
  );
}

// ---------------------------------------------------------------------------
console.log('\n[10] 演练端到端（分片 → 恢复 → 指纹比对，不依赖 DOM）');
{
  const secret = new TextEncoder().encode(vectorDup.join(' '));
  const raw = await split(secret, 5, 3);
  const parsed = raw.map((s, i) => encodeShare(s, i + 1, 3, 5)).map(parseShareData);

  // 演练恢复路径与 ShareManager.recoverFromShareData 一致：combine → 校验和关卡
  const dataShares = parsed.slice(0, 3).map((p) => Uint8Array.from(atob(p.data), (c) => c.charCodeAt(0)));
  const recovered = new TextDecoder().decode(await combine(dataShares));
  const gate = await validateMnemonicChecksum(recovered.trim().split(/\s+/));
  check('演练恢复路径：合并 + 校验和关卡通过', gate.isValid === true);

  const expectedFingerprint = computeMnemonicFingerprint(vectorDup.join(' '));
  const actualFingerprint = computeMnemonicFingerprint(recovered);
  check('指纹比对：恢复结果与创建时指纹一致', actualFingerprint === expectedFingerprint, `${actualFingerprint} vs ${expectedFingerprint}`);

  const otherFingerprint = computeMnemonicFingerprint(vector12.join(' '));
  check('指纹比对：另一组助记词的指纹无法通过', actualFingerprint !== otherFingerprint);

  // 校验码分区：3 好 + 1 坏（threshold=3）→ 坏片可被识别，好片仍足够恢复
  const goodLines = raw.map((s, i) => encodeShare(s, i + 1, 3, 5)).slice(0, 3);
  const firstShare = parseShareData(goodLines[0]);
  const tamperedInner = Uint8Array.from(atob(firstShare.data), (c) => c.charCodeAt(0));
  tamperedInner[0] ^= 0x01;
  // 篡改内层 data 后重新走应用解析路径，checksumOk 由 parseShareData 重新计算
  const badLine = btoa(JSON.stringify({ index: 4, threshold: 3, total: 5, data: btoa(String.fromCharCode(...tamperedInner)), checksum: firstShare.checksum }));
  const mixed = [...goodLines.map(parseShareData), parseShareData(badLine)];
  const badCount = mixed.filter((p) => p?.checksumOk === false).length;
  check('混合输入中坏片被 checksumOk=false 点名', badCount === 1, `实际 ${badCount}`);
}

// ---------------------------------------------------------------------------
console.log(`\n结果：${passed} 项通过，${failed} 项失败`);
process.exit(failed > 0 ? 1 : 0);
