# Design Doc: 呼吸引擎架构

## 架构总览
浏览器内单进程，三个子系统：
1. audio/ —— 检测与合成（Web Audio API）
2. visual/ —— 侗锦纹样渲染（Canvas 2D）
3. ui/ —— 状态机与引导文案

## audio/
- BreathDetector：getUserMedia → AnalyserNode → 振幅包络（平滑 + 起音阈值）→
  输出 onBreathIn / onBreathOut 事件。
- VoiceEngine：五声调式音阶表 + 每声部状态机（asleep → listening → entering →
  singing → leaving）。声部 i 的进入延迟 = i × 一个呼吸周期（支声的「慢半拍」
  在此实现）。退场：用户静默 8s 触发 leaving，间隔退场。
- 音色：每声部 oscillator（正弦/三角混合）+ 低通滤波 + 轻微 detune 形成合唱质感。
- DemoMode：合成呼吸包络注入 BreathDetector 输出，供无麦克风演示（AC6）。

## visual/
- BrocadeRenderer：菱形骨架纹样铺底；每个 AI 声部 = 一个半透明光斑，
  位置与透明度由声部状态机驱动；纹样全局包络 = 用户音量映射。
- 帧同步：requestAnimationFrame 与音频事件通过时间戳对齐（AC5）。

## ui/
- 状态机：idle → prompting → listening → singing → fading，对应文案切换。
- 文案：中文主引导 + 英文副标题（双语，中文在前）。

## Sequence（首次呼吸）
用户呼吸 → BreathDetector.onBreathOut → VoiceEngine 声部 1 回应 →
纹样局部点亮 + 文案「它们听见了」→ 下个周期声部 2 进入……
