// js/config.js —— 唯一参数源（决定 2 / D2）：声学与视觉全部可调，各模块零写死。
// 为什么外置：调参不动源码；透视开关与 MVP 后的 DialKit 接口都从这份表接。

// 十二平均律换算：MIDI 音号 → 频率（A4 = 440Hz 基准）
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// 五声调式音阶表（宫商角徵羽 = C D E G A，C 宫系统）：全部声部音高唯一来源（AC4）
const PENTATONIC_MIDI = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74, 76]; // C3…E5

export const CONFIG = {

  audio: {

    mic: {
      // 呼吸是低频慢变信号：关掉降噪/AGC/回声消除，保住包络的真实起伏（AC3 前置）
      constraints: {
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      },
      fftSize: 1024,              // FFT 尺寸：低频分辨率优先，不求高频细节
      smoothingTimeConstant: 0.5, // analyser 自带平滑，检测层另做一重包络平滑
      inputGain: 2.2,             // 原始 RMS 抬升到检测阈值工作区间：安静呼吸也能过起音线
    },

    detector: {
      envelopeSmoothing: 0.12,    // 振幅包络一阶平滑系数：越小越钝，滤掉吞咽咳嗽的尖峰
      onsetThreshold: 0.14,       // 起音阈值：包络上行穿越判「一口气来了」（AC3）
      releaseThreshold: 0.07,     // 回落阈值（迟滞双阈）：低于判「气断了」，防临界抖动反复触发
      silenceSeconds: 8,          // 退场静默秒数：停止呼吸 8s → 逐层退场（AC4 / MVP 验收线）
      periodFallbackSeconds: 4,   // 呼吸周期估计兜底值（历史样本不足时用）
      periodWindow: 3,            // 周期估计取最近 N 次吸气间隔均值
      minPeriodSeconds: 2,        // 周期钳制下限：防异常间隔污染慢半拍调度
      maxPeriodSeconds: 9,        // 周期钳制上限
    },

    voice: {
      count: 4,                   // 声部数量（AC4 要求 ≥4）；光斑数量与它同源——每声部一缕光
      scaleTableHz: PENTATONIC_MIDI.map(hz), // 五声调式音阶表（Hz）
      anchorIndex: 5,             // 声部 0 锚定音（C4）：它是「回应你」的那一声
      entryDelayRatio: 1.0,       // 慢半拍延迟倍率：声部 i 进入延迟 = i × 呼吸周期 × 此值（D1 声音侧）
      exitStaggerSeconds: 1.2,    // 退场逐层间隔：静默触发后各声部错开此值依次退场（AC4/AC9）
      timbre: {
        sineGain: 0.65,           // 正弦分量
        triangleGain: 0.45,       // 三角分量：与正弦混合出合唱质感（design.md 音色）
        detuneCents: 6,           // 轻微 detune 静态量
        detuneLfoHz: 0.18,        // detune 极慢 LFO：人声式音高漂移
        lowpassHz: 1400,          // 低通截止：去掉三角波亮刺，靠近哼鸣
        attackSeconds: 1.4,       // 进入阻尼包络时长（D3 无硬切）
        releaseSeconds: 2.6,      // 退场阻尼包络时长
        breathFollowDepth: 0.18,  // 歌唱中增益随呼吸包络轻微起伏的深度
        noteWalkRange: 1,         // 每口呼吸声部在音阶表上移动的最大步数（支声缠绕，确定性步进）
      },
      ambient: {
        gain: 0.02,               // idle 仅一丝环境声（design-language 交互状态）
        freqsHz: [hz(33), hz(40)], // A1 + E2 低音持续音
        lfoHz: 0.05,              // 环境声极慢呼吸感起伏
      },
    },

    demo: {
      amplitude: 0.85,            // 注入包络峰值（与真实呼吸包络同量纲，同一事件通路，AC6）
      inhaleRatio: 0.38,          // 一个周期里吸气段占比
      exhaleFloor: 0.04,          // 呼气末尾残留：不落零，模拟换气余量
      // 3 分钟 Demo 彩排脚本（T8：开场引导 → 单次呼吸 → 连续合唱 → 停止退场）
      script: [
        { id: 'intro',   durationSeconds: 10, amplitude: 0 },                // 静场：纹样沉睡
        { id: 'single',  breaths: 1,  periodSeconds: 6.0, amplitude: 0.9 },  // 单次呼吸
        { id: 'rest1',   durationSeconds: 6,  amplitude: 0 },
        { id: 'choir1',  breaths: 14, periodSeconds: 4.0, amplitude: 0.85 }, // 连续合唱 · 匀
        { id: 'rest2',   durationSeconds: 5,  amplitude: 0 },
        { id: 'choir2',  breaths: 12, periodSeconds: 3.4, amplitude: 0.9 },  // 连续合唱 · 密
        { id: 'silence', durationSeconds: 14, amplitude: 0 },                // 停止：8s 静默 → 逐层退场
      ],
    },
  },

  visual: {

    palette: {
      base: '#0B0D17',          // 底色：近黑靛蓝，不用纯黑（design-language）
      patternWarm: '#C8A15A',   // 主纹样暖金：侗锦织线的暗金
      spotWarm: '#E8A25C',      // 声部光斑暖橙：你的呼吸那缕光
      spotCore: '#F6D9A0',      // 光斑芯：烛火芯
      ambientCool: '#1B2340',   // 微光氛围层冷靛（Ambient Lighting）
    },

    pattern: {
      density: 46,              // 纹样密度：菱形骨架格距（px，按 390px 宽视口基准缩放）
      crossSize: 5,             // 十字纹臂长
      hashInset: 12,            // 井字纹内缩距离
      pulseFrequencyHz: 0.11,   // 明灭曲线：呼吸式明灭基础频率
      pulseDepth: 0.35,         // 明灭深度
      pulseEasing: 1.6,         // 明灭曲线幂次：>1 时吐气段更缓，呼吸不对称感
      seed: 30626,              // 程序化纹样种子：同种子同构图，禁止无意义随机（seeded render）
    },

    spots: {
      radius: 26,               // 光斑基准半径（px）
      haloScale: 3.2,           // 光晕倍率
      followDamping: 0.10,      // 光斑跟随包络的阻尼系数
      riseDamping: 0.045,       // 「托住/退场」大位移的阻尼回弹系数（D3/AC9）
      driftSeconds: 9,          // 光斑缓慢漂移周期（烛火悬浮感）
    },

    breathWindow: {
      gapBreakSeconds: 0.4,     // 断气窗口秒数：包络低于断线阈值持续此时长 → 触发「托住」（D1 视觉侧）
      lowThreshold: 0.05,       // 「断开」判定的包络线
    },

    ambientLight: {
      glowBrightness: 0.30,     // 微光亮度上限：随呼吸包络逐帧振动（D3 Ambient Lighting）
      vignetteStrength: 0.55,   // 边缘压暗强度：让光斑成为唯一焦点
    },

    perspective: {              // 透视开关（D2 加分项，不进验收线）：预留参数即接口，UI 属 T8
      defaultOn: false,
      skeletonAlpha: 0.85,      // 骨架层不透明度
      lineColor: '#5A6B9E',     // 声部连线（状态机骨架）
    },
  },
};
