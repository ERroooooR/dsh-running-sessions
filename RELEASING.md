# 发版

发布由 GitHub Actions 完成，本地不需要 `npm login`，也不需要仓库里的 `NPM_TOKEN` secret —— 工作流用 npm **Trusted Publishing（OIDC）** 以本仓库的身份发布，并附 provenance 签名。

## 一次发版

```sh
# 1. 升版本（会改 package.json / package-lock 若有）
npm version 1.3.4 --no-git-tag-version

# 2. 提交
git add -A
git commit -m "chore: 升到 1.3.4"
git push origin main

# 3. 打 tag 并推送 —— 这一步才真正触发发布
git tag v1.3.4
git push origin v1.3.4
```

工作流会按顺序做：校验 tag 与 `package.json` 版本一致 → 跑测试 → 校验打包清单 → 查这个版本是否已在 registry → 发布 → 打包 tarball → 建 GitHub Release。

**版本号与 tag 必须一致**，否则在触碰 registry 之前就会失败。

## 两种发布结果

npm 上包的 Trusted publishing 条目有一个 **Allowed actions** 设置：

| 设置 | 工作流行为 |
| --- | --- |
| 勾了 `npm publish` | 直接发布，`dsh-running-sessions@x.y.z` 立刻可用 |
| 只勾 `npm stage publish`（2026-09-03 之后新建条目的默认值） | 版本进入暂存区，等维护者审批 |

两种都不影响 GitHub Release —— tarball 照常附上去。

workflow run 的 Summary 会写明这次是哪种结果（`published` / `staged`），并给出审批链接。

## 审批一个暂存版本

任选其一：

1. 打开 https://www.npmjs.com/package/dsh-running-sessions?activeTab=versions ，在 Staged 区域点 Approve（需要 2FA）。
2. 在已登录、且 npm ≥ 11.15 的机器上：

   ```sh
   npm stage list dsh-running-sessions   # 打印暂存的版本和 stage id
   npm stage approve <stage-id>          # 需要 OTP
   ```

审批之后 `npm view dsh-running-sessions version` 才会变成新版本。

> 想让以后直接发布：npmjs.com → 包的 Settings → Trusted publishing → 编辑条目 → Allowed actions 勾上 `npm publish`。

## 失败之后

- **只重跑工作流**：同一 tag 的 run 可以直接 Re-run；「已发布则跳过」的判断和「已暂存则跳过」的判断都在，重跑不会造成重复发布。
- **改代码后再发**：不要 `git tag -f` 覆盖已推送的 tag，直接升一个新版本号、打新 tag。已推送的 tag 一旦被覆盖，别人手里那份和远端就对不上了。

## 首次配置（只需一次）

1. 在 npmjs.com 建包（或让第一次 stage 自动建占位）并把维护者设为自己。
2. 包的 Settings → Trusted publishing 添加：
   - Organization or user：`ERroooooR`
   - Repository：`dsh-running-sessions`
   - Workflow filename：`publish.yml`（只写文件名，不要写 `.github/workflows/` 前缀）
   - Environment：留空（工作流没有用 environment）
3. Allowed actions：按需要勾 `npm publish`；不勾则每次发版走暂存审批。
