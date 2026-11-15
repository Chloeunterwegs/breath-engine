// js/ui/copy.js —— T7：双语引导文案（中文主引导 + 英文副标题，中文在前，design.md ui 约定）。
// 文案原则：不用算法词，用动作讲（决定 1）——「它们听见了」「它们在等你换气」。
// 恐怖感来自纹样与留白，不来自贴纸文案（design-language）。

export const COPY = {
  idle: {
    main: '试一次呼吸',
    sub: 'Try one breath',
    hint: '点一下屏幕，把麦克风交给它',
  },
  prompting: {
    main: '等它接过你的气',
    sub: 'Waking the choir',
    hint: '',
  },
  listening: {
    main: '对它呼一口气——它们在听',
    sub: 'Breathe once — they are listening',
    hint: '哼唱也可以，它们不挑',
  },
  singing: {
    main: '它们听见了',
    sub: 'They heard you',
    hint: '',
  },
  // 连续呼吸、≥2 声部已在织体中：节奏提示（design-language「它们在等你」）
  singingWeave: {
    main: '它们在等你换气',
    sub: 'They wait for your breath',
    hint: '停下来也没关系，它们会先唱一会儿',
  },
  fading: {
    main: '它们慢慢退到暗处',
    sub: 'They fade into the dark',
    hint: '',
  },
  denied: {
    main: '麦克风没来——不碍事',
    sub: 'Mic declined — the choir can still sing',
    hint: '进演示模式，合成呼吸走同一条通路',
  },
  demo: {
    main: '演示中：合成呼吸走同一通路',
    sub: 'Demo — synthetic breath, same pathway',
    hint: '',
  },
};
