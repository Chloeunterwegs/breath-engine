# Design Doc: 呼吸引擎架构

## 架构总览
浏览器内单进程，三个子系统：
1. engine/ —— 检测与合成（Web Audio API）
2. visual/ —— 侗锦纹样渲染（Canvas 2D）
3. ui/ —— 状态机与引导文案

参数外置：声学/视觉可调参数统一在 js/config.js，三个子系统只读不写。
硬约束：纯前端零依赖，仓库根 `python3 -m http.server` 直开即可完整演示；
判定方法见 requirements.md「硬约束判定方法」。

## engine/
- BreathDetector：getUserMedia → AnalyserNode → 振幅包络（平滑 + 起音阈值）→
  输出 onBreathIn / onBreathOut 事件。
- VoiceEngine：五声调式音阶表 + 每声部状态机（asleep → listening → entering →
  singing → leaving）。声部 i 的进入延迟 = i × 一个呼吸周期（支声的「慢半拍」
  在此实现）。退场：用户静默 8s 触发 leaving，间隔退场。
- 可打断语义（决定 3 / AC9）：entering / singing / leaving 可随时跳转——
  新呼吸打断退场、静默打断进入；状态转换走阻尼包络，无硬切、无锁死状态。
- 音色：每声部 oscillator（正弦/三角混合）+ 低通滤波 + 轻微 detune 形成合唱质感。
- DemoMode：合成呼吸包络注入 BreathDetector 输出，供无麦克风演示（AC6），
  与真实麦克风走同一事件通路。

## visual/
- BrocadeRenderer：菱形骨架纹样铺底；每个 AI 声部 = 一缕暖色光斑。
  核心母题「断气 → 托住」：主光斑（你的呼吸）在换气 0.4s 处断开时，邻声部光斑
  慢半拍浮出托住它，拧成支声织体；纹样全局包络 = 用户音量映射。
- 透视开关（D2 加分项，不进验收线）：config.js 预留参数即接口，开关 UI 属 T8
  加分项、有余力再做——一键关掉表层纹样，只看声部状态机骨架。
- 动效手感（决定 3 / AC9）：光斑进入/退场与纹样明灭均可随时打断，
  位移与透明度用阻尼缓动回弹，不做死板补间；背景微光是全局氛围层
  （Ambient Lighting），亮度随呼吸包络逐帧振动。
- 帧同步：requestAnimationFrame 与音频事件通过时间戳对齐（AC5）。

## ui/
- 状态机：idle → prompting → listening → singing → fading，对应文案切换；
  麦克风权限被拒走 denied 分支——非阻塞提示 + 一键进 Demo（AC2）。
- 文案：中文主引导 + 英文副标题（双语，中文在前）。

## Sequence（首次呼吸）
用户呼吸 → BreathDetector.onBreathOut → VoiceEngine 声部 1 回应 →
纹样局部点亮 + 文案「它们听见了」→ 下个周期声部 2 进入……
