// js/engine/voice-engine.js —— T4：五声调式音阶表 + 声部状态机 + 音色合成。
// 每声部一张图：正弦+三角（轻微 detune）→ 状态包络（setTargetAtTime 阻尼，无硬切）
// → 呼吸随动增益（逐帧微调）→ 低通 → 汇流。全部静默期为零输出，起振即淡入。
// 可打断语义（D3/AC9）：状态目标用 setTargetAtTime 改写——随时改目标即随时打断，
// 包络从当前值平滑滑向新目标，无残响堆积、无锁死。

import { CONFIG } from '../config.js';

// 声部状态机（design.md）：asleep → listening → entering → singing → leaving
// T4 接通声部 1 的即时回应；listening 档位由 T5 的支声调度（慢半拍进入）启用。
export const VOICE_STATES = ['asleep', 'listening', 'entering', 'singing', 'leaving'];

export class VoiceEngine {
  constructor(ctx) {
    this._ctx = ctx;
    const vcfg = CONFIG.audio.voice;
    this._scale = vcfg.scaleTableHz;          // 五声调式音阶表（Hz）：音高唯一来源（AC4）
    this._anchor = vcfg.anchorIndex;
    this._entryDelayRatio = vcfg.entryDelayRatio;
    this._exitStaggerMs = vcfg.exitStaggerSeconds * 1000;
    this._timbre = vcfg.timbre;

    // 汇流总增益 = headroom / 声部数：多声部叠加不爆音，数值仍从 config 折算（D2）
    this._master = ctx.createGain();
    this._master.gain.value = vcfg.timbre.headroom / vcfg.count;
    this._master.connect(ctx.destination);

    this._voices = [];
    for (let i = 0; i < vcfg.count; i++) {
      this._voices.push(this._buildVoice(i));
    }
    this._buildAmbient(vcfg.ambient);

    this._breathCount = 0;   // T5 支声缠绕的确定性步进序列号
  }

  _buildVoice(index) {
    const ctx = this._ctx;
    const t = this._timbre;

    // 音色：正弦+三角双振荡器，三角静态上偏 detuneCents，极慢 LFO 同步漂移两轨
    const oscSine = ctx.createOscillator();
    oscSine.type = 'sine';
    const oscTri = ctx.createOscillator();
    oscTri.type = 'triangle';
    oscTri.detune.value = t.detuneCents;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = t.detuneLfoHz;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = t.detuneCents;      // 人声式漂移幅度
    lfo.connect(lfoGain);
    lfoGain.connect(oscSine.detune);
    lfoGain.connect(oscTri.detune);

    const sineGain = ctx.createGain();
    sineGain.gain.value = t.sineGain;
    const triGain = ctx.createGain();
    triGain.gain.value = t.triangleGain;

    // 状态包络：所有进入/退场都走 setTargetAtTime 的阻尼滑移（D3 无硬切）
    const envGain = ctx.createGain();
    envGain.gain.value = 0;

    // 呼吸随动：歌唱中增益随呼吸包络轻微起伏（逐帧微调，步长极小无咔哒）
    const breathGain = ctx.createGain();
    breathGain.gain.value = 1;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = t.lowpassHz;
    lowpass.Q.value = 0.7;

    oscSine.connect(sineGain).connect(envGain);
    oscTri.connect(triGain).connect(envGain);
    envGain.connect(breathGain).connect(lowpass).connect(this._master);
    oscSine.start();
    oscTri.start();
    lfo.start();

    return {
      index,
      state: 'asleep',
      noteIndex: this._anchor,          // 声部音高在音阶表上的位置
      oscSine,
      oscTri,
      envGain,
      breathGain,
      enteredAt: 0,
      leftAt: 0,
    };
  }

  // idle 环境声：A1+E2 极低音持续音 + 慢 LFO，「仅一丝」（design-language 交互状态）
  _buildAmbient(cfg) {
    const ctx = this._ctx;
    const bus = ctx.createGain();
    bus.gain.value = cfg.gain;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = cfg.lfoHz;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = cfg.gain * 0.5;    // 环境声自身的呼吸起伏
    lfo.connect(lfoGain).connect(bus.gain);
    for (const f of cfg.freqsHz) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      osc.connect(bus);
      osc.start();
    }
    lfo.start();
    bus.connect(this._ctx.destination);
  }

  // 音高落表：所有声部频率只允许来自音阶表（AC4 验收「音高全部落在调式表内」）
  _setNote(voice, index) {
    const clamped = Math.max(0, Math.min(this._scale.length - 1, index));
    voice.noteIndex = clamped;
    const hzv = this._scale[clamped];
    const t = this._ctx.currentTime;
    voice.oscSine.frequency.setTargetAtTime(hzv, t, 0.06);   // 小滑音：换音不硬切
    voice.oscTri.frequency.setTargetAtTime(hzv, t, 0.06);
  }

  // T4：声部 1 即时回应。T5 在此扩展支声调度（声部 i 慢半拍进入）。
  handleBreathIn(ev) {
    this._breathCount += 1;
    const v = this._voices[0];
    this._enter(v, ev.at);
  }

  // 呼气不断声——支声的托举正发生在换气间隙（T5 处理多声部情形）
  handleBreathOut() {}

  // 静默触发退场（D3「停止呼吸即退场」的声音侧；T5 扩展为逐层错开退场）
  handleSilence(ev) {
    this._leave(this._voices[0], ev.at);
  }

  _enter(voice, atMs) {
    const ctx = this._ctx;
    const tau = this._timbre.attackSeconds / 3;   // setTargetAtTime 时间常数：tau 后 ≈95% 到位
    voice.state = 'entering';
    voice.enteredAt = atMs;
    voice.envGain.gain.setTargetAtTime(1, ctx.currentTime, tau);  // 从当前值阻尼滑升，可被打断
  }

  _leave(voice, atMs) {
    const ctx = this._ctx;
    const tau = this._timbre.releaseSeconds / 3;
    voice.state = 'leaving';
    voice.leftAt = atMs;
    voice.envGain.gain.setTargetAtTime(0, ctx.currentTime, tau);  // 阻尼滑落，可被打断
  }

  // 每帧推进：状态标签迁移 + 歌唱中呼吸随动。时间戳判断而非 setTimeout——随时打断（AC9）
  update(now, envelope) {
    const t = this._timbre;
    for (const v of this._voices) {
      if (v.state === 'entering' && now - v.enteredAt >= t.attackSeconds * 1000) {
        v.state = 'singing';
      }
      if (v.state === 'leaving' && now - v.leftAt >= t.releaseSeconds * 1000) {
        v.state = 'asleep';
      }
      // 呼吸随动深度：歌唱/进入中包络轻微抬升增益（breathFollowDepth 从 config 读）
      const active = v.state === 'entering' || v.state === 'singing';
      const target = active ? 1 + t.breathFollowDepth * (envelope || 0) : 1;
      v.breathGain.gain.value += (target - v.breathGain.gain.value) * 0.2;
    }
  }

  // 渲染层/透视开关读这里：每声部的状态、音高、序号（只读快照，AC5/AC9 的对账面）
  getVoiceStates() {
    return this._voices.map((v) => ({
      index: v.index,
      state: v.state,
      noteIndex: v.noteIndex,
    }));
  }
}
