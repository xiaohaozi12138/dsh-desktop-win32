<img width="1534" height="1533" alt="大肥鱼" src="https://github.com/user-attachments/assets/443adeb8-78a8-4c9f-90fe-bdc7493bbcaa" />
# dsh-desktop-launcher-win32

> DSH web 插件：Windows 桌面启动器。在桌面生成一个小鲸鱼ico 图标的 `.lnk` 快捷方式，双击后唤醒 `dsh web` 服务并自动打开浏览器。（需启动一次dsh才能出现快捷启动器）

仅支持 Windows（非 Windows 自动跳过）。

## 功能

- 加载后在桌面创建 `dsh-web-launcher.cmd` 启动脚本 + 带图标的 `.lnk` 快捷方式
- 双击快捷方式：
  1. 检测 `127.0.0.1:3080` 是否已监听
  2. 未监听则启动 `dsh web`（`node <dsh>/lib/bin.js web`）
  3. 轮询等待端口就绪（最多约 2 分钟）
  4. 自动打开默认浏览器访问 WebUI
- 图标**默认直接使用打包在 `assets/dfy.ico`**，无需任何操作，也不会弹框打扰
- 换图标方式：
  - 在 profile patch 层通过 `iconPath` 指定任意 `.ico`（优先级最高）
  - 或设置 `askIconOnStart: true`，插件加载时弹出 Windows 文件选择框自选（选择会被记住，之后不再弹）
  - 或手动改 `~/.dsh/dsh-desktop-launcher-icon.txt`（记住的选择，删除后重新弹框）

## 安装（作为 bundle 加载）

```bash
# 把插件目录链接进 profile（路径替换为你自己的）
dsh plugin --profile web add link:C:/dsh/dsh-desktop-win32
```

或手工在 profile `package.json` 的 `dependencies` 添加：
```json
"dsh-desktop-launcher-win32": "link:C:/dsh/dsh-desktop-win32"
```
并在 `dsh.profile.bundles` 追加 `"dsh-desktop-launcher-win32"`。

## 配置（cordis.patch.yml）

```yaml
- id: dsh-desktop-launcher-win32
  config:
    launcherName: "DSH Web 启动器"   # .lnk 名称
    iconPath: "C:/path/to/my.ico"    # 自定义图标（留空 = 默认 dfy.ico，不弹框）
    askIconOnStart: false            # true = 加载时弹 Windows 选择框自选图标
    port: 3080                       # 服务端口
    url: "http://127.0.0.1:3080"     # 打开地址
```
