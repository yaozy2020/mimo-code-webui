# MiMo Code WebUI 可部署性整改计划

> [!NOTE]
> 本计划关注项目可迁移性：让其他用户下载即用，而非仅服务于当前 NAS 环境。

## 现状评估

| 维度 | 状态 |
|:-----|:-----|
| 安全基线 | ✅ 已修 B1（unauth endpoints）/ B2（timing-safe token）/ B3（CORS lockdown） |
| 代码治理 | ✅ debug 清理 + governance 已做 |
| 构建产物 | ❌ `web/dist` + `server/dist` 在 .gitignore，用户拿不到 |
| 分发渠道 | ❌ 无 release、无预构建包 |
| 新用户引导 | ❌ 配置散落三处（环境变量 / mimocode.json / localStorage），无引导页 |
| 运行依赖 | ❌ 强依赖 mimo CLI + Node.js 18+，无前置检测 |
| CI | ❌ GitHub Actions 额度用完 |

## 阶段 1：可交付（预构建 + 本地 release）

**目标**：用户下载 zip → 解压 → `node server/dist/index.js` → 浏览器打开

| # | 任务 | 产出 | 验收标准 |
|:-:|:-----|:-----|:---------|
| 1.1 | 本地构建 | `npm run build` 产出 `web/dist` + `server/dist` | typecheck + build 通过 |
| 1.2 | 打包 release zip | `mimo-webui-v0.1.0.zip`（含 dist + package.json + scripts） | 解压后 `node server/dist/index.js` 能启动 |
| 1.3 | GitHub Release | 手动上传 zip + 写 release notes | 下载链接可访问 |
| 1.4 | README 部署章节 | "快速开始"三步：装 mimo → 下载 zip → 启动 | 新手照做能跑 |

## 阶段 2：可用明白（首次引导 + 配置收敛）

**目标**：新用户打开页面 → 引导完成配置 → 直接开始用

| # | 任务 | 产出 | 验收标准 |
|:-:|:-----|:-----|:---------|
| 2.1 | 前置检测端点 | `/status` 增返回 mimo 就绪状态 + 配置完整性 | 未配 mimo 时返回明确错误 |
| 2.2 | 首次启动引导页 | 前端检测到未配置 → 引导页（输入 API Key → 选模型 → 生成 AUTH_TOKEN） | 配置完成后自动跳转聊天页 |
| 2.3 | 配置写入后端 | 引导页提交 → 后端写入 `~/.config/mimocode/config.json` + 生成 `.env` | 写入后重启生效，二次打开不再弹引导 |
| 2.4 | README 重写 | 面向使用者：快速开始 / 配置 / 已知问题 | 不含任何开发术语 |

## 阶段 3：可维护（质量补全）

**目标**：他人接手不踩坑

| # | 任务 | 产出 | 验收标准 |
|:-:|:-----|:-----|:---------|
| 3.1 | D2 SSRF 防护 | `baseUrl` 校验 https + 拒绝内网/链路本地地址 | 测试覆盖 |
| 3.2 | 核心路径集成测试 | 鉴权、代理、进程管理三个路径 | `npm run verify` 覆盖 |
| 3.3 | appStore 拆分 | 657 行 → 按域拆 3-4 个 store | typecheck + build 通过 |
| 3.4 | 死代码清理 | 多 workspace 路由（D1）要么实现要么删除 | 无空转代码 |

## 不做

- Docker / fpk（项目本身裸跑，无容器化需求）
- npm 全局包（mimo 安装不解决，包装了也没用）
- CI 恢复（额度恢复后再说）
- `@playwright/test` e2e（当前无 e2e 需求）

## 依赖关系

```
阶段 1（可交付）→ 独立，无前置依赖
阶段 2（引导页）→ 依赖 1.4 的 README 框架 + 2.1 的检测端点
阶段 3（质量补全）→ 独立，可随时做
```

## 建议执行顺序

先 1.1-1.4 打包发 release（半天），让别人先能拿到能跑的东西。然后阶段 2 做引导页（3-5 天），阶段 3 跟着架构整改一起做。