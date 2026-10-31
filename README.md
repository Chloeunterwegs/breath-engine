# 换气 BreathCatcher · Kiroween 2026

以呼吸为乐器的生成式音乐应用。你的呼吸驱动 AI 支声合唱——
AI 声部「慢半拍」进入，陪你换气，不是给你伴奏。

美学锚点：侗族大歌支声——多声部唱腔互相缠绕，故意错开半拍等同伴换气。
音乐是社会性的等待。

## Run
```bash
cd 306-Kiroween2026-换气
python3 -m http.server 8080
# 手机与电脑同网段，浏览器打开 http://<电脑IP>:8080
```
或直接双击 index.html（Web Audio 需非 file:// 协议时以 http.server 为准）。

## Demo Mode
无麦克风也可演示：页面底部「Demo Mode」按钮注入模拟呼吸包络。

## Project Structure
- `.kiro/steering/` — Kiro 项目约束（总览/设计语言/工程标准）
- `.kiro/specs/` — Feature specs（requirements/design/tasks）
- `.kiro/hooks/` — 开发钩子（保存时语法检查）
- `js/` — 源码（engine/ visual/ ui/）

## Kiro Usage
项目按 spec-driven development 构建：`.kiro/specs/feature-01-breath-engine/`
下 requirements → design → tasks 三件套驱动 Kiro 逐 task 实现并 commit。

## License
MIT — 详见 LICENSE。
