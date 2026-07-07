# WALKMAN '26 · 3D 磁带随身听

一台运行在浏览器里的 3D Walkman 磁带播放器 —— 以 2026 年的设计语言重新演绎：铝合金侧环、石墨哑光面板、烟熏亚克力舱门、琥珀色点阵屏。

打开舱门、装入磁带、按下播放，卷带轮会随音乐真实转动（供带轮变小、收带轮变大），快进快退时反向 / 高速旋转，还有变调音与倒带呼啸声。

## 在线体验

推送到 GitHub 后由 Actions 自动发布至 GitHub Pages（见下文）。

## 操作方式

| 操作 | 鼠标 | 键盘 |
| --- | --- | --- |
| 播放 / 暂停 | 点击中央 ▶ 按钮 | `空格` |
| 停止 | 点击 ■ | `S` |
| 快进 / 快退 | **长按** ▶▶ / ◀◀ | 长按 `→` / `←` |
| 上一首 / 下一首 | **短按** ◀◀ / ▶▶ | 短按 `←` / `→` |
| 出仓 / 入仓 | 点击 ⏏（或点击弹出的磁带） | `E` |
| 音量 | 拖动 / 滚轮滚动右侧旋钮 | `↑` / `↓` |
| 视角 | 拖动旋转 · 滚轮缩放 | — |
| 换带 | 把 MP3 文件直接拖进页面 | — |

## 添加自己的音乐

1. 把 `.mp3`（或 `.m4a` / `.wav` / `.ogg` / `.flac`）文件放进 `music/` 目录；
2. 推送到 GitHub —— 部署工作流会自动扫描 `music/` 并重新生成 `playlist.json`，无需手动编辑；
3. 本地想立即生效的话，运行：

```bash
node tools/build-playlist.mjs
```

（`playlist.json` 中已有的曲目标题会被保留，可手动改成好看的名字。）

## 本地运行

静态站点，任意 HTTP 服务器即可（不要直接双击 index.html，`fetch` 会被 file:// 拦截）：

```bash
python3 -m http.server 8123
# 打开 http://localhost:8123/
```

## 发布到 GitHub Pages

仓库已内置 `.github/workflows/deploy.yml`，推送即部署：

```bash
git init -b main
git add -A
git commit -m "init"
# 使用 GitHub CLI 一键建仓并推送（仓库需为 Public）
gh repo create walkman-3d --public --source=. --push
```

推送后 Actions 会自动：

1. 扫描 `music/` 生成播放列表；
2. 启用 GitHub Pages（首次运行自动开启，无需去设置页手动配置）；
3. 部署站点到 `https://<你的用户名>.github.io/walkman-3d/`。

之后每次向 `main` 推送（比如往 `music/` 里加歌）都会自动重新发布。

> 不用 CLI 的话：在 GitHub 网页新建仓库 → `git remote add origin … && git push -u origin main` → 仓库 Settings → Pages → Source 选 "GitHub Actions"（如果工作流没有自动开启）。

## 技术栈

- [Three.js](https://threejs.org/)（CDN import map，无构建步骤）：机身用带舱口的圆角挤出体、物理材质、UnrealBloom 辉光、软阴影
- Web Audio API：VU 频谱、快进变调、倒带呼啸、按键音全部实时合成，无音效素材
- 点阵屏：低分辨率 Canvas → 最近邻放大 → LED 圆点蒙版
- 磁带物理：恒定线速度 → 卷带轮角速度与卷径成反比，卷径随播放进度此消彼长

`tools/` 下另有两个可选的开发脚本（需要本机可用的 puppeteer）：`shot.mjs` 无头截图、`interact.mjs` 交互回归测试；它们不参与部署。

## 目录结构

```
├── index.html            # 入口
├── css/style.css         # HUD / 加载动画
├── js/
│   ├── main.js           # 场景、灯光、后期、交互
│   ├── walkman.js        # 3D 模型与机械动画
│   ├── audio.js          # 音频引擎与合成音效
│   ├── display.js        # 点阵屏
│   └── tween.js          # 补间动画
├── music/                # 你的 MP3 + playlist.json
├── tools/build-playlist.mjs
└── .github/workflows/deploy.yml
```
