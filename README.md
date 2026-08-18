# dsh-desktop-launcher-win32

> DSH web 插件：Windows 桌面启动器。在桌面生成一个**带自定义 .ico 图标**的 `.lnk` 快捷方式，双击后唤醒 `dsh web` 服务并自动打开浏览器。

仅支持 Windows（非 Windows 自动跳过）。

## 功能

- 加载后在桌面创建 `dsh-web-launcher.cmd` 启动脚本 + 带图标的 `.lnk` 快捷方式
- 双击快捷方式：
  1. 检测 `127.0.0.1:3080` 是否已监听
  2. 未监听则启动 `dsh web`（`node <dsh>/lib/bin.js web`）
  3. 轮询等待端口就绪（最多约 2 分钟）
  4. 自动打开默认浏览器访问 WebUI
- 图标默认为 `assets/dfy.ico`，可在 profile patch 层通过 `iconPath` 配置任意 `.ico`

## 安装（作为 bundle 加载）

```bash
# 把插件目录链接进 profile（路径替换为你自己的）
dsh plugin --profile web add link:F:/dsh/dsh-desktop-win32
```

或手工在 profile `package.json` 的 `dependencies` 添加：
```json
"dsh-desktop-launcher-win32": "link:F:/dsh/dsh-desktop-win32"
```
并在 `dsh.profile.bundles` 追加 `"dsh-desktop-launcher-win32"`。

## 配置（cordis.patch.yml）

```yaml
- id: dsh-desktop-launcher-win32
  config:
    launcherName: "DSH Web 启动器"   # .lnk 名称
    iconPath: "C:/path/to/my.ico"    # 自定义图标（留空 = 默认 dfy.ico）
    port: 3080                       # 服务端口
    url: "http://127.0.0.1:3080"     # 打开地址
```
