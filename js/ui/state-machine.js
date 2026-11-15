// js/ui/state-machine.js —— T7：应用状态机（idle→prompting→listening→singing→fading
// + denied 分支）+ 引导接线 + 主循环装配。本文件是 ESM 入口（index.html 唯一 script）。
// AC8：打开第一秒即全屏纹样 + 呼吸引导——渲染器在 idle 就开始画沉睡纹样，
// 文案层第一帧就在，无介绍页、无登录、无满屏按钮。
// AC2：麦克风被拒走 denied 分支——非阻塞提示 + 一键进 Demo（DemoMode 随 task-8 落位）。

import { CONFIG } from '../config.js';
import { COPY } from './copy.js';
import { BrocadeRenderer } from '../visual/brocade-renderer.js';
import { AudioInput } from '../engine/audio-input.js';
import { BreathDetector } from '../engine/breath-detector.js';
import { VoiceEngine } from '../engine/voice-engine.js';
import { DemoMode } from '../engine/demo-mode.js';

const UI_STATES = ['idle', 'prompting', 'listening', 'singing', 'fading', 'denied'];

class App {
  constructor() {
    this._canvas = document.getElementById('stage');
    this._meterEl = document.getElementById('meter');
    this._copyMain = document.getElementById('copy-main');
    this._copySub = document.getElementById('copy-sub');
    this._copyHint = document.getElementById('copy-hint');
    this._demoBtn = document.getElementById('demo-btn');
    this._perspectiveBtn = document.getElementById('perspective-btn');

    this._renderer = new BrocadeRenderer(this._canvas);
    this._detector = new BreathDetector();
    this._audio = new AudioInput();
    this._engine = null;          // 首次手势后才创建（AudioContext 需用户手势）
    this._demo = new DemoMode();  // 合成呼吸源：与真实麦克风互为可换源（AC6 同一事件通路）
    this._demoActive = false;

    this._uiState = 'idle';
    this._lastCopyKey = null;
  }

  boot() {
    // 第一秒：沉睡纹样 + 引导文案就位（AC8），事件接线完成后进入主循环
    this._wireDetector();
    this._bindControls();
    this._setState('idle');
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);

    // 只读诊断句柄：透视开关的数字面，验收脚本与真机走查都读它
    window.__breathCatcher = {
      state: () => this._uiState,
      voices: () => (this._engine ? this._engine.getVoiceStates() : []),
      envelope: () => this._detector.smoothed,
      latency: () => this._detector.lastLatencyMs,
      demoActive: () => this._demoActive,
    };
  }

  _wireDetector() {
    this._detector.onBreathIn = (ev) => {
      if (this._engine) this._engine.handleBreathIn(ev);
      this._renderer.pushEvent({ type: 'breathIn', at: ev.at, periodMs: ev.periodMs });
      if (this._uiState === 'listening' || this._uiState === 'fading') {
        this._setState('singing');
      }
    };
    this._detector.onBreathOut = (ev) => {
      if (this._engine) this._engine.handleBreathOut(ev);
      this._renderer.pushEvent({ type: 'breathOut', at: ev.at });
    };
    // 静默触发逐层退场（D3「停止呼吸即退场」），UI 同步进 fading
    this._detector.onSilence = (ev) => {
      if (this._engine) this._engine.handleSilence(ev);
      if (this._uiState === 'singing') this._setState('fading');
    };
  }

  _bindControls() {
    // 第一次手势：AudioContext + getUserMedia 都必须在手势回调内（自动播放策略）
    const firstGesture = () => {
      document.removeEventListener('pointerdown', firstGesture);
      this._onFirstGesture();
    };
    document.addEventListener('pointerdown', firstGesture);

    this._demoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleDemo();
    });

    // 透视开关（T8 加分项）：按键 V 或角落按钮，关掉表层纹样只看声部状态机骨架
    document.addEventListener('keydown', (e) => {
      if (e.key === 'v' || e.key === 'V') this._togglePerspective();
    });
    if (this._perspectiveBtn) {
      this._perspectiveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._togglePerspective();
      });
    }
  }

  async _onFirstGesture() {
    if (this._uiState !== 'idle' || this._demoActive) return;
    this._setState('prompting');

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume();
    this._engine = new VoiceEngine(ctx);
    this._audio.attach(ctx, this._meterEl);

    const granted = await this._audio.requestMic({
      onGranted: () => {
        this._detector.setSource(() => this._audio.getEnvelope());
        this._setState('listening');
      },
      onDenied: () => {
        // AC2：非阻塞提示 + Demo 可进，页面其余功能完整——这里只切文案与状态
        this._setState('denied');
      },
    });
    if (!granted && !this._demoActive && this._uiState === 'prompting') {
      this._setState('denied');
    }
  }

  // Demo 开关（AC6）：合成呼吸包络注入 BreathDetector，
  // 与真实麦克风同一事件通路；无麦克风环境走完全状态机。
  _toggleDemo() {
    if (!this._demoActive) {
      this._demoActive = true;
      this._audio.stop();         // 演示时不采样麦克风，省电且防双包络
      this._ensureEngine();
      this._detector.setSource(() => this._demo.getEnvelope(performance.now()));
      this._demo.start(performance.now());
      if (this._uiState === 'idle' || this._uiState === 'prompting' || this._uiState === 'denied') {
        this._setState('listening');
      }
      this._demoBtn.textContent = '停止演示';
    } else {
      this._demoActive = false;
      this._demo.stop();
      this._detector.setSource(null);
      this._setState(this._engine ? 'listening' : 'idle');
      this._demoBtn.textContent = '演示模式';
    }
    document.body.dataset.demo = this._demoActive ? 'on' : 'off';
  }

  // Demo 可能早于任何手势启动（denied 一键进 Demo）——引擎在此兜底创建
  _ensureEngine() {
    if (this._engine) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // 点击 demo 按钮本身即手势，可合法 resume
    ctx.resume();
    this._engine = new VoiceEngine(ctx);
    this._audio.attach(ctx, this._meterEl);
  }

  _togglePerspective() {
    const next = !this._perspectiveBtn || this._perspectiveBtn.getAttribute('aria-pressed') !== 'true';
    this._renderer.setPerspective(next);
    if (this._perspectiveBtn) this._perspectiveBtn.setAttribute('aria-pressed', String(next));
  }

  _setState(next) {
    if (!UI_STATES.includes(next)) return;
    this._uiState = next;
    document.body.dataset.state = next;
    // 文案与状态机同步（T7 验收）；singing 内按织体密度二段切换（design-language 节奏提示）
    const voices = this._engine ? this._engine.getVoiceStates() : [];
    const inWeave = voices.filter((v) => v.state !== 'asleep' && v.state !== 'leaving').length;
    const key = next === 'singing' && inWeave >= 2 ? 'singingWeave' : next;
    this._setCopy(key);
    // 自检音量条只在麦克风模式下可见（Demo 的包络不走麦克风，DEMO-SCRIPT.md 同口径）
    const micVisible =
      !this._demoActive &&
      (next === 'listening' || next === 'singing' || next === 'fading');
    this._meterEl.style.display = micVisible ? 'block' : 'none';
  }

  _setCopy(key) {
    if (key === this._lastCopyKey) return;
    this._lastCopyKey = key;
    const c = COPY[key] || COPY.idle;
    this._copyMain.textContent = c.main;
    this._copySub.textContent = c.sub;
    this._copyHint.textContent = c.hint;
  }

  // 主循环：先续帧再干活——单帧异常不断流（AC2 不白屏不卡死），错误仍逐帧上抛可见。
  // 检测 → 声部 → 渲染 同一帧内推进（AC5）；UI 从声部状态回流（fading→listening）。
  _loop() {
    requestAnimationFrame(this._loop);
    const now = performance.now();
    this._detector.update(now);
    const envelope = this._detector.smoothed;
    if (this._engine) {
      this._engine.update(now, envelope);
      if (
        this._uiState === 'fading' &&
        envelope < CONFIG.visual.breathWindow.lowThreshold &&
        this._engine.getVoiceStates().every((v) => v.state === 'asleep')
      ) {
        this._setState('listening');
      }
    }
    this._renderer.render(now, envelope, this._engine ? this._engine.getVoiceStates() : null);
  }
}

const app = new App();
app.boot();
