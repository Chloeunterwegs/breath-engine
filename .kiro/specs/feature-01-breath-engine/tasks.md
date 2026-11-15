# Tasks: 呼吸引擎 MVP

> 施工基准：project-overview.md 三条决定——D1 一个母题讲完全片（L38）、D2 参数外置+透视开关不做调参台（L44）、D3 一切动效可打断+物理手感+微光振动（L50）。
> 硬约束（每条任务同）：纯前端、零 API Key、零 CDN、零后端；仓库根 `python3 -m http.server` 直开即可验证，判定方法见 requirements.md。
> 目录约定：js/engine/（检测与合成）、js/visual/（渲染）、js/ui/（状态机与文案），与 design.md 一致。

- [x] T1 项目骨架与参数外置（AC1 · D2）
  产出：index.html 单页壳（全屏画布挂载点 + 暗色侗锦底色）；js/config.js；js/engine/、js/visual/、js/ui/ 目录。
  config.js 分组注释：声学参数（五声调式音阶表、慢半拍延迟倍率、退场静默秒数）与视觉参数（纹样密度、光斑数量、明灭曲线、微光亮度、断气窗口秒数）。
  验收：`python3 -m http.server` 直开无 404；页面加载 <1s，Network 面板除本机外零请求（AC1）；上述参数只在 config.js 声明，JS 源码零写死（D2）。

- [x] T2 音频输入管线（AC2/AC3 前置 · D2）
  产出：js/engine/audio-input.js —— getUserMedia 授权 + AnalyserNode 振幅包络 + 实时音量条自检可视化。
  权限被拒走 AC2 分支：非阻塞提示 + 引导进 Demo Mode，页面不白屏不卡死。
  验收：说话/呼吸时音量条实时响应；拒绝授权后页面仍可操作并可进入演示模式；平滑系数、FFT 尺寸等采样参数从 config.js 读（D2）。

- [x] T3 BreathDetector 呼吸事件（AC3 · D3 信号源）
  产出：js/engine/breath-detector.js —— 振幅包络平滑 + 起音检测，输出 onBreathIn/onBreathOut 事件与静默计时。
  验收：呼吸动作触发事件，DevTools console 打点延迟 <150ms（AC3）；停止呼吸后静默信号准确（D3「停止呼吸即退场」的信号源）；起音阈值、退场静默秒数从 config.js 读（D2）。

- [x] T4 VoiceEngine 单声部（AC4 声部 1 · D1 声音基底 + D2）
  产出：js/engine/voice-engine.js —— 五声调式音阶表 + 声部 1 状态机（asleep→listening→entering→singing→leaving）；每声部 oscillator（正弦/三角混合）+ 低通滤波 + 轻微 detune。
  验收：单次呼吸触发声部 1 回应，音高全部落在调式表内；呼吸停止后声部 1 可退场；调式表、音色参数从 config.js 读（D2）。

- [x] T5 支声织体与可打断状态机（AC4/AC5 全声部 · AC9 声部侧 · D1/D3）
  产出：VoiceEngine 扩展至 ≥4 声部；声部 i 进入延迟 = i × 一个呼吸周期（慢半拍，D1 母题的声音侧）；静默 8s 逐层退场；entering/singing/leaving 可随时被打断——新呼吸打断退场、静默打断进入，状态转换走阻尼包络（D3/AC9）。
  验收：连续呼吸 → ≥4 声部依次慢半拍进入（AC4）；打断退场后无残响堆积、无锁死状态（AC9）；退场静默秒数从 config.js 读（D2）。

- [x] T6 BrocadeRenderer 母题渲染（AC5 · AC9 视觉侧 · D1/D3）
  产出：js/visual/brocade-renderer.js —— Canvas 2D 菱形骨架纹样铺底；每声部一缕暖色光斑；「断气→托住」母题：主光斑换气断开时邻声部光斑慢半拍浮出托住、拧成支声织体（D1）；背景微光全局氛围层，亮度随呼吸包络振动（D3）；纹样明灭可打断、位移与透明度阻尼回弹（D3/AC9）。
  验收：requestAnimationFrame 与音频事件时间戳对齐、同帧渲染（AC5）；停止呼吸 → 光斑与纹样按阻尼曲线退场、无死板补间（AC9）；纹样密度、光斑数量、明灭曲线从 config.js 读（D2）。

- [ ] T7 状态机与引导文案（AC8 · AC2 · D1 第一秒）
  产出：js/ui/state-machine.js（idle→prompting→listening→singing→fading，加 denied 分支）+ js/ui/copy.js（中文主引导 + 英文副标题，中文在前）；权限被拒走 denied：非阻塞提示 + 一键进 Demo（AC2）。
  验收：打开第一秒即全屏纹样 + 呼吸引导，无介绍页、无登录、无满屏按钮（AC8 · D1）；文案切换与状态机同步；麦克风被拒时应用功能完整、可进演示模式（AC2）。

- [ ] T8 DemoMode 与彩排（AC6 · D2 · MVP 验收线第 4 条）
  产出：js/engine/demo-mode.js —— 按钮触发合成呼吸包络注入 BreathDetector 输出，与真实麦克风同一事件通路；注入包络参数从 config.js 读（D2）；3 分钟 Demo 彩排脚本一页（开场引导→单次呼吸→连续合唱→停止退场）。
  加分项（有余力再做，不进验收线，D2）：透视开关——config.js 预留参数即接口，开关 UI 关掉表层纹样、只看声部状态机骨架。
  验收：无麦克风环境（或拒绝授权）下 Demo 全流程可录、走完整状态机；演示包络与真实呼吸触发同一事件路径。

- [ ] T9 真机验收（AC7）——目标 2026-11-30 前，本轮不施工
  iPhone Safari + Android Chrome 全流程走查；requirements.md MVP 验收线逐条核（含三条硬约束判定方法）。

- [ ] T10 README 与 Demo 视频（提交件）——目标 2026-11-30 前，本轮不施工
  README 使用说明（含 Kiro 使用说明，见 KIROWEEN-NOTES.md 提交要求）+ 录 <3 分钟 Demo 视频上传 YouTube 公开。

完成标准：
- 本轮 T1–T8：全部勾选，requirements.md「MVP 验收线」逐条核过、三条硬约束判定方法全过。
- 11 月底 T9/T10：真机验收通过、Demo 视频上传公开（早于 2026-12-04 14:00 PST 截止，见 KIROWEEN-NOTES.md 时间线）。
