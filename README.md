# 换气 BreathCatcher · Kiroween 2026

以呼吸为乐器的生成式音乐应用。你的呼吸驱动 AI 支声合唱——
AI 声部「慢半拍」进入，陪你换气，不是给你伴奏。

美学锚点：侗族大歌支声——多声部唱腔互相缠绕，故意错开半拍等同伴换气。
音乐是社会性的等待。

## Run（30 秒上手）
```bash
python3 -m http.server 8080
# 手机与电脑同网段，浏览器打开 http://<电脑IP>:8080
```
或直接双击 index.html（Web Audio 需非 file:// 协议时以 http.server 为准）。

打开后：
1. 点一下屏幕，把麦克风交给它（iPhone Safari / Android Chrome 均可）
2. 对着屏幕呼气——第一口气点亮主光斑，一个声部即时回应（五声调式）
3. 连续呼吸——第 2/3/4 声部每口气「慢半拍」浮出；每次换气断开 0.4 秒处，
   邻声部光斑浮出托住主光斑（本作母题：断气 → 托住）
4. 停下来别动——8 秒后声部逐层退回暗处；随时重新呼吸可打断退场

## Demo Mode
无麦克风也可演示：麦克风授权被拒后「演示模式」按钮点亮，合成呼吸包络
注入 BreathDetector，与真实呼吸走同一事件通路（AC6），完整流程照录、照玩。

## Demo 录制
四幕脚本（开场引导 → 单次呼吸 → 连续合唱 → 停止退场，约 2 分 20 秒，<3 分钟）
见 [DEMO-SCRIPT.md](DEMO-SCRIPT.md)。

## Project Structure
- `.kiro/steering/` — Kiro 项目约束（总览/设计语言/工程标准）
- `.kiro/specs/` — Feature specs（requirements/design/tasks）
- `.kiro/hooks/` — 开发钩子（保存时语法检查）
- `js/` — 源码（engine/ visual/ ui/）

## 硬约束与验收
纯前端、零 API Key、零 CDN、零后端——断网照跑。
逐条验收记录（AC1–AC9 + 三条硬约束判定）见 [KIROWEEN-NOTES.md](KIROWEEN-NOTES.md)。

## Kiro Usage
本项目按 spec-driven development 构建。Kiro.app 本机不在位（mdfind + /Applications
双核确认），按任务卡兜底条款施工，未虚构 IDE 会话：

- **spec**：`.kiro/specs/feature-01-breath-engine/` —— requirements → design → tasks
  三件套驱动 T1–T10 逐 task 实现并 commit（12 个实现 commit message 均含 Kiro
  使用说明，git log 可查）
- **steering**：`.kiro/steering/` —— project-overview / design-language /
  engineering-standards 三件约束设计
- **hooks**：`scripts/check-syntax.sh`（node --check 保存期语法检查，等效
  `.kiro/hooks/syntax-check-on-save.json` 语义）
- **MCP**：未使用——纯前端 + 零外部依赖本项目不需要

## License
MIT — 详见 LICENSE。
