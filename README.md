# MnemonicShards

离线单文件助记词分片工具：用 Shamir Secret Sharing把 12/24 词助记词切成多张分片，任意达到阈值数量的分片即可恢复；可选 OpenPGP 加密、助记词指纹定期演练、分片校验码坏片定位，并附带 BTC 观察地址派生（zpub 导出）。所有计算在浏览器本地完成，数据不离开设备。

## 🚀 快速使用

```bash
git clone <repository-url>
cd MnemonicShards
npm install && npm run build
# dist/mnemonic-shards-offline.html 是自包含单文件离线版，双击即可在任意浏览器打开
open dist/mnemonic-shards-offline.html
```

- 环境要求：Node.js **22.12+**（硬性下限 20.19，来自 Vite 7；Node 20 已 EOL，不建议）。仅开发与构建需要 Node——产物是纯静态单 HTML，直接使用无需任何运行时
- 构建产物**已入库**，clone 后可直接打开 `dist/mnemonic-shards-offline.html`，无需构建
- 本地开发：`npm run dev` → http://localhost:5173；`npm run preview` 预览构建产物
- 首次使用请先阅读下方[「⚠️ 风险提示与注意事项」](#️-风险提示与注意事项)一节

## 🧩 功能总览

界面为三个模式 + 全局能力，全部离线运行、无任何网络请求。

### 分割助记词

- 12/24 词输入，BIP39 **词表 + 校验和**双重验证；单词智能联想（↑↓ 选择、Enter 选中、Esc 关闭）、重复词检测、实时计数反馈
- 在第一个输入框粘贴完整助记词，自动分发到所有格子并切换词数
- 分片配置：总数 3–7、恢复阈值 2–5，k-of-n 阈值可视化示意
- **助记词指纹**：8 位十六进制（SHA-256 前 4 字节），4+4 分组便于抄写；指纹不写入任何分片
- **分片校验码**（v1.2+）：每张分片内嵌 8 位 Crockford Base32 校验码（排除 I/L/O/U 易混字母），分片卡与下载文件均可见，供人工核对抄录
- 可选 **OpenPGP 加密**（AES-256，输出与标准 GPG 兼容）：内置密码生成与强度校验（低于 12 位的密码会被拦截）；密码仅用于当次加解密，不落盘、不写入分片
- 一键复制 / 下载每张分片（明文 `.txt` 或加密 `.gpg`）；复制明文分片后 **60 秒自动清除剪贴板**（期间复制过其他内容则不动）
- passphrase（第 25 词）**不参与分片**

### 恢复助记词

- 粘贴 / 上传双标签：一次粘贴多个分片（每行一个，自动处理换行），或批量上传文件（`.txt` / `.gpg`，单个 ≤ 5MB）
- 混合文件时可勾选「跳过解密」处理未加密分片
- **坏片定位**：带校验码的分片恢复时自动逐张核对，抄录/损坏的会被点名；富余分片足够时自动跳过坏片完成恢复
- **恢复演练模式**：勾选后只输出「指纹是否一致」的结论，全程不显示助记词明文，适合定期零暴露校验；指纹留空则显示本次恢复结果的指纹（旧版分片可借此建立指纹）
- 恢复结果内联展示，带「复制 / 隐藏 / 擦除」保护，用完即清；复制助记词后 60 秒自动清除剪贴板

### 观察地址（BTC）

- 助记词离线派生 BTC 收款地址（默认前 3 笔，可展开更多）；不联网、不查余额、不显示私钥
- 三种路径预设：Native SegWit `m/84'/0'/0'`（默认，zpub）、Nested SegWit `m/49'/0'/0'`（ypub）、Legacy `m/44'/0'/0'`（xpub）
- 可选 BIP39 passphrase（第 25 词）支持
- 地址首尾 8 位高亮、中间淡化，方便与钱包/交易所比对，兼顾旁窥隐私
- 账户级扩展公钥（zpub/ypub/xpub）导出 + 二维码，供 BlueWallet 等钱包扫码导入 Watch-only 观察钱包
- 旁窥防护：zpub 默认模糊遮蔽，点「显示」后 60 秒自动回遮蔽；复制需两段式确认；二维码弹层关闭立即回遮蔽
- 内存卫生：派生完成 5 分钟后自动清除内存中的助记词与 passphrase；**切换到其他模式立即清场**（观察侧输入全部清空，已派生的地址/zpub 为公钥信息保留展示）

### 全局

- 完全客户端运行：无服务器、无网络请求、无本地持久化
- **CSP 纵深防御**（v1.3+）：产物内嵌 Content-Security-Policy，默认拒绝一切网络加载——即使依赖被误引入外链或产物被篡改植入外联脚本，也会被浏览器拦截
- 快捷键：`Ctrl/Cmd + Enter` 触发当前模式主操作（生成分片 / 恢复 / 派生地址）；`Esc` 关闭 Toast 与二维码弹层
- 「擦除所有数据」两段式确认，一键清空三个模式的全部输入与结果

## 🎯 使用方法

### 创建分片（推荐开启加密）

1. 「分割助记词」模式：选择词数（12/24）、分片总数与恢复阈值
2. 输入助记词（自动验证每个单词与校验和）；记下页面的 8 位指纹，抄写到保管卡
3. 启用加密并创建强密码（或用内置生成器）→「生成并加密分片」；不加密则点「生成分片」
4. 下载/抄写分片（保管方式见[「风险提示」](#️-风险提示与注意事项)）

### 定期演练

1. 「恢复助记词」模式，勾选「演练模式」，输入预期指纹（留空则只验证可完整恢复，并显示本次结果的指纹——抄下后下次即可比对）
2. 粘贴或上传分片，点击「恢复助记词」
3. 看到「演练通过 · 指纹一致」即备份有效，全程无明文暴露
4. 若提示某张分片「校验码不匹配」，重新核对该分片的抄录；富余分片足够时工具会自动跳过坏片完成演练
5. 演练后点结果卡上的「擦除」，再执行一次全局「擦除所有数据」

### 导入观察钱包

1. 「观察地址」模式：选择地址类型（BlueWallet 默认 Native SegWit，其余按钱包实际路径选择）；若钱包设置了第 25 词，展开 passphrase 填写
2. 点击「派生地址」，获得收款地址列表（首尾 8 位高亮，方便比对）
3. 展开「观察钱包导出」卡片，点「显示」核对 zpub，再用「二维码」让手机扫码：BlueWallet →「+」→ 导入钱包 → Watch-only → 扫描
4. 导入后核对：BlueWallet 首个收款地址应与本工具 0/0 行一致（比对首尾 8 位）
5. 用完点击「擦除所有数据」清空本页

## ⚠️ 风险提示与注意事项

所有风险提示收口于本节，文档其他位置只描述功能。工具无法防御被篡改的副本与已失陷的运行环境，以下事项请务必遵守。

### 使用前：校验产物完整性

钓鱼者分发一个"同款"页面即可窃取你输入的助记词。**任何来源拿到的副本，使用前先校验哈希**——构建时自动生成 GNU 格式校验文件 `dist/SHA256SUMS.txt`（与产物一起入库、随发布附件分发）：

```bash
# 仓库内（产物与校验文件同在 dist/ 目录）
cd dist && shasum -a 256 -c SHA256SUMS.txt   # macOS/Linux
# Windows PowerShell: Get-FileHash .\mnemonic-shards-offline.html -Algorithm SHA256
#                     再与 SHA256SUMS.txt 中的哈希比对

# 只有单个 HTML 文件时：与可信来源（本仓库或发布页）的 SHA256SUMS.txt 内容比对
```

校验文件本身也可能随产物一起被替换，因此哈希同时锚定在 git tag 对应的提交上，可独立复核：`git show v1.3.0:dist/mnemonic-shards-offline.html | shasum -a 256`

### 使用注意事项

- **运行环境**：在断网设备上操作；用无扩展的隐私窗口或专用浏览器 Profile 打开——扩展、剪贴板管理器、截屏/录屏软件都能读到页面内容与剪贴板；本工具无法防御已失陷的操作系统
- **剪贴板与屏幕**：复制助记词/明文分片后工具会在 60 秒自动清剪贴板，但系统剪贴板历史（如 Win+V）与第三方剪贴板工具仍可能留存；全程请勿截屏或录屏
- **分片保管**：分片存不同物理位置（全部放一处则 k-of-n 形同虚设），勿拍照存相册/云盘；建议开启加密——明文分片在低于阈值数量时仍会泄露助记词的结构信息，且加密后可用标准 GPG 解密（逃生舱不锁死）
- **三样东西分开存放**：分片、加密密码（≥12 位，建议用内置生成器）、passphrase（第 25 词）；**密码或 passphrase 遗忘 = 分片永久无法使用**，务必各自另行安全备份；指纹仅 32 位、泄露无法推出助记词，可抄写到保管卡
- **观察钱包边界**：zpub 只暴露余额隐私、不能转走资金，转账签名始终在冷钱包侧；向派生地址转账时核对首尾 8 位，防范剪贴板劫持类恶意软件
- **定期演练**：每 6–12 个月用「演练模式」做零暴露校验；分片抄录损坏会被校验码自动点名定位
- **离线归档一份工具**：单文件离线版与分片一起归档，确保断网多年后仍能恢复

### 编译注意事项

- **只在可信环境构建**：构建机失陷会直接产出窃取助记词的副本；对他人提供的产物，务必校验哈希后再使用
- **源码与产物一致**：改动源码后必须 `npm run release`（重建并暂存产物与 SHA256SUMS.txt）再提交——pre-commit 钩子与 CI 会校验入库产物与源码构建逐字节一致，拦截过期或分叉的产物
- **发布新版本时**：`npm run release` 会重建产物并同步生成 `dist/SHA256SUMS.txt`，提交后打对应版本 tag，并用 `git show <tag>:dist/... | shasum -a 256` 复核哈希一致
- **依赖变更需人工确认**：全部依赖精确锁版（含 devDeps——vite 版本直接影响产物字节；`shamir-secret-sharing` 处于 0.0.x 阶段，minor 即破坏性变更），升级统一走 Dependabot 显式 PR + 人工确认 + 完整发布流程（重建、更新 SHA256SUMS、打 tag），杜绝 `^` 范围与 `npm update` 带来的静默漂移

> 本工具仅供教育和研究目的使用。请自行承担使用风险，理解 Shamir Secret Sharing 的工作原理，使用前充分测试，并妥善保管生成的分片。

## 📄 分片格式规范（逃生舱文档）

即使不使用本工具，你也可以依据以下公开格式自行实现恢复，分片不会深度绑定本项目：

- 每份分片是一个 Base64 字符串，解码后为 JSON：`{"index": <分片序号>, "threshold": <恢复阈值>, "total": <总分片数>, "data": "<Base64(秘密分片字节)>", "checksum": "<8位分片校验码，v1.2+ 可选>"}`
- `checksum`（可选，v1.2+）：`data` 字段 Base64 解码后的字节取 SHA-256 前 5 字节，用 Crockford Base32（字母表 `0123456789ABCDEFGHJKMNPQRSTVWXYZ`，排除 I/L/O/U）编码为 8 个字符。该字段仅供人工核对与恢复时定位损坏分片，**恢复算法本身不使用它**——缺少该字段的旧格式分片（以及任何忽略该字段的第三方实现）均可正常恢复
- 助记词指纹（页面展示与演练比对用，**不写入分片**）：SHA-256(归一化助记词) 前 4 字节的十六进制大写。归一化 = trim → 按空白拆分 → 单空格连接 → 转小写。示例：官方测试向量 `abandon … about` 的指纹为 `C557EEC8`
- 恢复步骤：取任意 `threshold` 份分片 → 解码 JSON → Base64 解码 `data` 字段 → 使用 GF(2^8) 上的 Shamir Secret Sharing（如 [shamir-secret-sharing](https://www.npmjs.com/package/shamir-secret-sharing) 库，经独立审计）合并 → 得到 UTF-8 编码的助记词 → 按 BIP39 标准校验
- 开启加密时分片文件为标准 OpenPGP 格式（`.gpg`），先用 `gpg --decrypt` 解密得到上述 Base64 字符串，再按上述步骤恢复
- 可运行 `npm run verify` 查看一个不依赖本项目代码的独立恢复演示

## 🛠️ 开发与维护

### 常用命令

```bash
npm run dev       # 开发服务器 http://localhost:5173
npm run build     # 构建单文件产物到 dist/
npm run preview   # 预览构建产物
npm run verify    # 独立回归：词表/校验和/分片往返/指纹演练（55 项）
npm run release   # 构建最新产物并暂存 dist/（常规发布流程）
```

### 技术栈

依赖原则：直接依赖 6 个、运行时传递依赖仅 1 个（@scure/bip32 → @noble/curves），全部为密码学领域知名、经审计或久经考验的实现；BIP39 种子派生等基础运算直接使用平台原生 WebCrypto。

- **[shamir-secret-sharing](https://www.npmjs.com/package/shamir-secret-sharing)** - GF(2^8) Shamir Secret Sharing，Privy 出品（零依赖、灵感来自 hashicorp/vault 实现），Cure53 与 Zellic 双重独立审计
- **[openpgp](https://www.npmjs.com/package/openpgp)** - OpenPGP AES-256 对称加密，与 GPG 兼容。刻意保留此库（占产物约 7 成体积）以维持「标准 `gpg --decrypt` 可解密分片」的逃生舱特性
- **@scure/bip32 / @scure/base / @noble/hashes** - paulmillr 出品、经审计的纯 JS 密码学库（BIP32 派生、地址编码、SHA-256/RIPEMD-160）
- **[qrcode-generator](https://www.npmjs.com/package/qrcode-generator)** - 二维码离线渲染（原始参考实现，零传递依赖）
- **Vite + vite-plugin-singlefile** - 构建为自包含单 HTML；原生 JavaScript 无框架依赖

### 项目结构

```
src/
├── components/              # 核心组件
│   ├── MnemonicInput.js     # 助记词输入（联想、验证、重复检测、粘贴分发、多实例参数化）
│   ├── ShareManager.js      # 分片生成与恢复（加密、指纹、校验码、结果保护）
│   ├── RecoveryTabManager.js # 恢复标签管理（粘贴/上传、演练模式、跳过解密）
│   ├── AddressWatcher.js    # 地址观察（BTC 派生、zpub 导出、二维码弹层、遮蔽控制）
│   ├── ShardVisualizer.js   # k-of-n 阈值可视化
│   └── Toast.js             # 全局瞬态消息
├── utils/
│   ├── dom.js               # DOM 操作工具
│   ├── validation.js        # BIP39 词表与校验和验证
│   ├── encryption.js        # OpenPGP 加解密、密码强度校验
│   ├── derivation.js        # BIP39 种子、BIP32 账户派生、BTC 地址编码
│   ├── integrity.js         # 助记词指纹与分片校验码（Crockford Base32）
│   └── helpers.js           # 复制、下载、两段式确认等通用工具
├── styles/styles.css        # 主样式（现代设计系统）
├── constants/               # 常量（应用配置、BIP39 词表）
└── main.js                  # 应用入口（模式切换、事件绑定、全局擦除）

根目录/
├── index.html               # 主页面
├── vite.config.js           # 构建配置（单文件打包）
├── scripts/verify-bip39.mjs # 独立回归脚本（npm run verify）
└── dist/mnemonic-shards-offline.html # 构建产物（入库归档）
```

## 📄 许可证

MIT License

---

**⚡ MnemonicShards**: 单文件部署，无服务器要求，完全客户端运行
