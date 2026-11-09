# 工程标准（Steering）

## 技术栈（固定，勿引入新依赖）
- 原生 JavaScript ES Modules + Web Audio API + Canvas 2D。
- 无构建步骤、无打包器、无 npm 依赖、零 CDN。
- 单页应用：index.html + js/（engine/、visual/、ui/）。

## 代码规范
- JS 全 ESM；英文标识符，中文注释说明「为什么」而非「是什么」。
- 音色合成全部自写 oscillator + 滤波器链；禁止引用任何版权音频。
- 声学/视觉可调参数统一进 js/config.js：五声调式、慢半拍延迟、退场秒数、纹样密度、
  光斑数量、明灭曲线等全部可调，禁止 magic number 散落在模块里。
- 手机 Safari 优先测试（Demo 录制设备）。

## 提交纪律（Kiroween 硬性要求）
- .kiro 目录永不进 .gitignore，永不删除。
- 每个 task 完成即 commit，message 格式：`feat(task-N): 一句话`。
