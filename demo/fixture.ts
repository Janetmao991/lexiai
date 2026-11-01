// Demo-mode content: pre-written lookups, sentence breakdowns, a notebook, a review queue,
// a few real podcast lines and two canned Ask Lexi answers. Shown when the app runs with
// ?demo=1 (see services/demo.ts) — nothing here is ever sent anywhere.
//
// Podcast lines are real quotes from the public shows LexiAI indexes. Our own audio clips
// live in a private bucket, so the demo shows them as text only (clipPath: null).
import type { WordEntry, ContextMeaning, SynonymComparison, UserStats, SrsState } from '../types';
import type { PodcastClip } from '../services/podcastService';
import { todayStr, daysFromToday } from '../services/srsService';

type Sense = { meaning: number; definition: number };

export interface DemoFixture {
  /** Full dictionary entries, plus other spellings/inflections that should open them. */
  entries: (WordEntry & { aliases?: string[] })[];
  /** The visitor's starting notebook (keyed like the real one: by headword). */
  notebook: Record<string, WordEntry>;
  /** Meaning-in-context results. The first result is the default; the rest answer taps on other words. */
  sentences: { sentence: string; results: (ContextMeaning & { sense: Sense | null })[] }[];
  clips: Record<string, (PodcastClip & { sense: Sense | null })[]>;
  askLexi: { question: string; keys: string[]; answer: string }[];
  comparisons: SynonymComparison[];
  stats: UserStats;
  /** Tappable starters on the empty Look up screen and in Ask Lexi. */
  suggestions: { words: string[]; sentences: string[]; ask: string[] };
}

// ---------- Dictionary entries ----------

const appall: WordEntry = {
  word: 'appall',
  ipa: 'əˈpɔːl',
  timestamp: 0,
  meanings: [
    {
      partOfSpeech: 'verb',
      definitions: [
        {
          definition: 'To fill someone with shock and strong disapproval, usually because something seems morally wrong or unacceptable.',
          gloss: '使震惊；使愕然（含强烈反感、不认同）',
          synonyms: ['horrify', 'outrage', 'shock', 'dismay'],
          examples: [
            'Investors were appalled by the board’s decision to award bonuses after the layoffs.',
            'I’m appalled that nobody checked the numbers before the report went out.',
          ],
          collocations: ['be appalled by', 'be appalled at', 'appalled to learn', 'genuinely appalled', 'appalled silence'],
        },
      ],
    },
    {
      partOfSpeech: 'adjective (appalling)',
      definitions: [
        {
          definition: 'Shockingly bad or of very poor quality — often used loosely for things that are merely terrible, not immoral.',
          gloss: '骇人的；糟糕透顶的',
          synonyms: ['dreadful', 'atrocious', 'abysmal'],
          examples: [
            'The customer service was appalling — three weeks and still no reply.',
            'Working conditions at the plant were appalling.',
          ],
          collocations: ['appalling conditions', 'appalling record', 'appalling treatment', 'absolutely appalling'],
        },
      ],
    },
  ],
  variants: [
    { form: 'appal', note: 'British spelling of the same verb — identical meaning.' },
    { form: 'appalled at vs appalled by', note: 'Both are fine; “by” is more common for the cause, “at” for a situation you witness.' },
  ],
};

const bludgeon: WordEntry = {
  word: 'bludgeon',
  ipa: 'ˈblʌdʒən',
  timestamp: 0,
  meanings: [
    {
      partOfSpeech: 'noun',
      definitions: [
        {
          definition: 'A short, thick stick with a heavy end, used as a weapon.',
          gloss: '大头棒；短棍',
          synonyms: ['club', 'cudgel', 'truncheon'],
          examples: ['The victim had been struck with a bludgeon.'],
          collocations: ['a heavy bludgeon', 'wield a bludgeon', 'armed with a bludgeon'],
        },
        {
          definition: 'A crude, forceful method or argument that works by pressure rather than subtlety.',
          gloss: '粗暴手段；生硬的工具',
          synonyms: ['blunt instrument', 'sledgehammer'],
          examples: [
            'Tariffs are a bludgeon, not a scalpel — they hit allies as hard as rivals.',
            'He used the quarterly targets as a bludgeon against the sales team.',
          ],
          collocations: ['a bludgeon, not a scalpel', 'use something as a bludgeon', 'regulatory bludgeon'],
        },
      ],
    },
    {
      partOfSpeech: 'verb',
      definitions: [
        {
          definition: 'To beat someone repeatedly with a heavy object.',
          gloss: '（用棍棒）连续猛击',
          synonyms: ['club', 'batter', 'beat'],
          examples: ['He was bludgeoned to death in the robbery.'],
          collocations: ['bludgeoned to death', 'brutally bludgeoned'],
        },
        {
          definition: 'To force someone into doing something by bullying, repeating arguments, or applying heavy pressure.',
          gloss: '强迫；硬逼（某人做某事）',
          synonyms: ['coerce', 'browbeat', 'strong-arm', 'railroad'],
          examples: [
            'The smaller firm was bludgeoned into accepting a lower price.',
            'Don’t try to bludgeon the reader with statistics — pick the one number that matters.',
          ],
          collocations: ['bludgeon someone into', 'bludgeon into submission', 'bludgeon through', 'bludgeon the opposition'],
        },
      ],
    },
  ],
};

const mullOver: WordEntry = {
  word: 'mull over',
  ipa: 'mʌl ˈoʊvər',
  timestamp: 0,
  meanings: [
    {
      partOfSpeech: 'phrasal verb',
      definitions: [
        {
          definition: 'To think about something carefully and at length, usually before making a decision.',
          gloss: '反复考虑；仔细琢磨',
          synonyms: ['ponder', 'deliberate', 'chew over', 'weigh up', 'turn over in your mind'],
          examples: [
            'Let me mull it over this weekend and get back to you on Monday.',
            'The board is still mulling over the offer.',
          ],
          collocations: ['mull it over', 'mull over an offer', 'mull over the options', 'time to mull over', 'still mulling over'],
        },
      ],
    },
    {
      partOfSpeech: 'verb (Finance)',
      definitions: [
        {
          definition: 'In business and market news (usually just “mull”): to consider a possible decision publicly before committing to it.',
          gloss: '（新闻用语）考虑；酝酿（某项决定）',
          synonyms: ['weigh', 'consider', 'explore'],
          examples: [
            'Fed officials mull a pause as inflation cools.',
            'The retailer is mulling a sale of its European unit.',
          ],
          collocations: ['mull a sale', 'mull a bid', 'mull a rate cut', 'mull options for'],
        },
      ],
    },
  ],
  variants: [
    { form: 'mull', note: 'Same meaning without “over”; very common in headlines (“Board mulls offer”).' },
    { form: 'mulled wine', note: 'A different verb: wine heated with spices — no connection to thinking.' },
  ],
};

const stretchedThin: WordEntry = {
  word: 'stretched thin',
  ipa: 'stretʃt θɪn',
  timestamp: 0,
  meanings: [
    {
      partOfSpeech: 'adjective phrase',
      definitions: [
        {
          definition: 'Having too much work or too many responsibilities for the people, time or energy available.',
          gloss: '人手（精力）严重不足；疲于应付',
          synonyms: ['overstretched', 'overextended', 'spread thin', 'swamped'],
          examples: [
            'With two people on leave, the support team is stretched thin.',
            'Parents of young kids often feel stretched thin.',
          ],
          collocations: ['feel stretched thin', 'stretched thin across', 'already stretched thin', 'too stretched thin to'],
        },
      ],
    },
    {
      partOfSpeech: 'adjective phrase (Finance)',
      definitions: [
        {
          definition: 'Of money, capital or a balance sheet: committed to so many demands that there is little margin left for shocks.',
          gloss: '（资金、资本）捉襟见肘；缓冲空间很小',
          synonyms: ['overleveraged', 'cash-strapped', 'thinly capitalised'],
          examples: [
            'Many regional lenders are stretched thin after two years of rising deposit costs.',
            'Household budgets are stretched thin, which is showing up in weaker discretionary spending.',
          ],
          collocations: ['balance sheet stretched thin', 'budgets stretched thin', 'capital stretched thin', 'liquidity stretched thin'],
        },
      ],
    },
  ],
  variants: [
    { form: 'spread thin', note: 'Very close; slightly more about dividing attention among many things.' },
    { form: 'stretched', note: 'On its own often means “short of money” (“we’re a bit stretched this month”).' },
  ],
};

const againstTheGrain: WordEntry = {
  word: 'go against the grain',
  ipa: 'ɡoʊ əˈɡenst ðə ɡreɪn',
  timestamp: 0,
  meanings: [
    {
      partOfSpeech: 'idiom',
      definitions: [
        {
          definition: 'To feel wrong or unnatural to you, because it conflicts with your instincts or principles.',
          gloss: '违背本性；让人心里不舒服',
          synonyms: ['sit uneasily with', 'run counter to', 'stick in your craw'],
          examples: [
            'It goes against the grain to throw away food that’s still good.',
            'Cutting the training budget really goes against the grain for her.',
          ],
          collocations: ['goes against the grain for someone', 'really goes against the grain', 'it goes against the grain to'],
        },
        {
          definition: 'To do or think something different from what most people do or expect; to be contrarian.',
          gloss: '反其道而行；与主流相悖',
          synonyms: ['buck the trend', 'swim against the tide', 'be contrarian'],
          examples: [
            'Going against the grain, the fund added to its bank holdings while everyone else was selling.',
            'Her advice goes against the grain of most career books.',
          ],
          collocations: ['go against the grain of', 'willing to go against the grain', 'cut against the grain'],
        },
      ],
    },
  ],
  variants: [
    { form: 'against the grain', note: 'Used as an adverb/adjective (“an against-the-grain bet”); same contrarian sense.' },
    { form: 'cut against the grain', note: 'Mostly American; leans toward sense ii — contradicting what is expected.' },
  ],
};

const clip: WordEntry = {
  word: 'clip',
  ipa: 'klɪp',
  timestamp: 0,
  meanings: [
    {
      partOfSpeech: 'noun',
      definitions: [
        {
          definition: 'A short extract from a film, broadcast, recording or video.',
          gloss: '片段；剪辑',
          synonyms: ['excerpt', 'snippet', 'segment'],
          examples: ['The clip went viral within an hour.', 'They played a clip from the earnings call.'],
          collocations: ['video clip', 'short clip', 'audio clip', 'play a clip', 'a clip from'],
        },
        {
          definition: 'A small device for holding things together or in place.',
          gloss: '夹子；回形针',
          synonyms: ['fastener', 'clasp', 'pin'],
          examples: ['She attached the receipts with a paper clip.'],
          collocations: ['paper clip', 'hair clip', 'tie clip', 'bulldog clip'],
        },
        {
          definition: 'Informal: a rate or speed, especially a fast one — almost always in the phrase “at a … clip”.',
          gloss: '（口语）速度；速率',
          synonyms: ['pace', 'rate', 'speed', 'tempo'],
          examples: [
            'Hiring has continued at a brisk clip.',
            'The economy grew at a 3% annual clip last quarter.',
          ],
          collocations: ['at a rapid clip', 'at a brisk clip', 'at a fast clip', 'at a steady clip', 'at an annual clip of'],
        },
      ],
    },
    {
      partOfSpeech: 'verb',
      definitions: [
        {
          definition: 'To cut or trim something with scissors or shears.',
          gloss: '剪；修剪',
          synonyms: ['trim', 'snip', 'crop'],
          examples: ['He clipped the article out of the newspaper.'],
          collocations: ['clip coupons', 'clip a hedge', 'clip your nails'],
        },
        {
          definition: 'To hit something lightly or at an angle while passing.',
          gloss: '擦撞；擦过',
          synonyms: ['graze', 'nick', 'brush'],
          examples: ['The truck clipped a parked car as it turned.'],
          collocations: ['clip the curb', 'clip a car', 'clipped by'],
        },
      ],
    },
  ],
  variants: [
    { form: 'at a clip', note: 'The fixed phrase behind sense iii — always about speed.' },
    { form: 'clipped', note: 'Adjective: (of speech) short, quick and a little curt — “a clipped reply”.' },
  ],
};

const gauge: WordEntry = {
  word: 'gauge',
  ipa: 'ɡeɪdʒ',
  timestamp: 0,
  meanings: [
    {
      partOfSpeech: 'verb',
      definitions: [
        {
          definition: 'To estimate or judge something that is hard to measure directly, such as a mood, risk or amount.',
          gloss: '估计；判断',
          synonyms: ['assess', 'judge', 'estimate', 'read', 'size up'],
          examples: [
            'It’s hard to gauge how serious the client is.',
            'We ran a small pilot to gauge demand.',
          ],
          collocations: ['gauge demand', 'gauge the mood', 'gauge the impact', 'hard to gauge', 'try to gauge'],
        },
        {
          definition: 'To measure something exactly with an instrument.',
          gloss: '（用仪器）测量',
          synonyms: ['measure', 'calibrate'],
          examples: ['Engineers gauged the thickness of the steel.'],
          collocations: ['gauge the pressure', 'gauge the depth'],
        },
      ],
    },
    {
      partOfSpeech: 'noun (Finance)',
      definitions: [
        {
          definition: 'An indicator or statistic used to judge the state of an economy or market.',
          gloss: '（经济）指标；风向标',
          synonyms: ['indicator', 'measure', 'barometer', 'bellwether'],
          examples: [
            'The Fed’s preferred inflation gauge rose 0.3% in September.',
            'A closely watched gauge of factory activity slipped into contraction.',
          ],
          collocations: ['inflation gauge', 'closely watched gauge', 'gauge of consumer confidence', 'a key gauge'],
        },
      ],
    },
    {
      partOfSpeech: 'noun',
      definitions: [
        {
          definition: 'An instrument that measures and shows an amount, level or pressure.',
          gloss: '计量器；仪表',
          synonyms: ['meter', 'dial'],
          examples: ['The fuel gauge was on empty.'],
          collocations: ['fuel gauge', 'pressure gauge', 'rain gauge'],
        },
      ],
    },
  ],
};

const headwind: WordEntry = {
  word: 'headwind',
  ipa: 'ˈhedˌwɪnd',
  timestamp: 0,
  meanings: [
    {
      partOfSpeech: 'noun',
      definitions: [
        {
          definition: 'A wind blowing directly against the direction you are moving in.',
          gloss: '逆风；顶头风',
          synonyms: ['contrary wind'],
          examples: ['The flight was delayed by strong headwinds over the Atlantic.'],
          collocations: ['strong headwind', 'into a headwind', 'cycle into a headwind'],
        },
      ],
    },
    {
      partOfSpeech: 'noun (Finance)',
      definitions: [
        {
          definition: 'A condition or factor that slows growth or makes results harder to achieve.',
          gloss: '不利因素；阻力',
          synonyms: ['drag', 'obstacle', 'impediment'],
          examples: [
            'A stronger dollar is a headwind for US exporters.',
            'Management flagged higher input costs as a headwind for the second half.',
          ],
          collocations: ['face headwinds', 'macro headwinds', 'currency headwind', 'a significant headwind', 'headwinds persist'],
        },
      ],
    },
  ],
  variants: [{ form: 'tailwind', note: 'The opposite: a factor that helps growth along.' }],
};

const ENTRIES: (WordEntry & { aliases?: string[] })[] = [
  { ...appall, aliases: ['appal', 'appalled', 'appalling', 'appalls'] },
  { ...bludgeon, aliases: ['bludgeoned', 'bludgeoning', 'bludgeons'] },
  { ...mullOver, aliases: ['mull', 'mulling over', 'mulled over', 'mull it over'] },
  { ...stretchedThin, aliases: ['stretch thin', 'stretched too thin', 'spread thin'] },
  { ...againstTheGrain, aliases: ['against the grain', 'goes against the grain', 'going against the grain'] },
  { ...clip, aliases: ['clips', 'clipped', 'at a clip'] },
  { ...gauge, aliases: ['gauges', 'gauged', 'gauging', 'gage'] },
  { ...headwind, aliases: ['headwinds'] },
];

// ---------- Sentence breakdowns ----------

const SENTENCES: DemoFixture['sentences'] = [
  {
    sentence: 'Sales have been growing at a pretty rapid clip since the spring.',
    results: [
      {
        word: 'clip',
        surface: 'clip',
        meaningHere: 'A rate or speed, especially a fast one (informal) — “at a rapid clip” means “quickly”.',
        glossHere: '速度；速率',
        usualMeaning: 'a short video, or a paper clip',
        usualGloss: '视频片段；夹子',
        clues: [
          { quote: 'growing at a', why: '“at a … clip” is a fixed pattern for speed' },
          { quote: 'pretty rapid', why: '“rapid” describes speed, not a video or a fastener' },
        ],
        paraphrase: 'Sales have been increasing quite quickly since the spring.',
        paraphraseGloss: '从春天开始，销售额一直在相当快地增长。',
        sense: { meaning: 0, definition: 2 },
      },
      {
        word: 'pretty',
        surface: 'pretty',
        meaningHere: 'Fairly; to quite a high degree (informal adverb before an adjective).',
        glossHere: '相当；挺',
        usualMeaning: 'attractive, nice to look at',
        usualGloss: '漂亮的',
        clues: [{ quote: 'pretty rapid', why: 'it sits before another adjective, so it modifies “rapid”' }],
        paraphrase: 'Sales have been growing fairly fast since the spring.',
        paraphraseGloss: '从春天起，销售额增长得挺快。',
        sense: null,
      },
    ],
  },
  {
    sentence: 'With two engineers out, the team is stretched thin and the launch will probably slip to June.',
    results: [
      {
        word: 'stretched thin',
        surface: 'stretched thin',
        meaningHere: 'Having too much work for the people available.',
        glossHere: '人手严重不足；疲于应付',
        usualMeaning: '',
        clues: [
          { quote: 'two engineers out', why: 'fewer people than usual' },
          { quote: 'the team is', why: 'it describes people, not money — sense i, not the finance sense' },
        ],
        paraphrase: 'Two engineers are away, so the team has too much to do and the launch will probably be delayed until June.',
        paraphraseGloss: '有两名工程师不在，团队人手吃紧，发布很可能要推迟到六月。',
        sense: { meaning: 0, definition: 0 },
      },
      {
        word: 'slip',
        surface: 'slip',
        meaningHere: 'Of a date or deadline: to be postponed to a later time.',
        glossHere: '（日期）推迟；延后',
        usualMeaning: 'to slide and lose your balance',
        usualGloss: '滑倒',
        clues: [
          { quote: 'the launch will', why: 'a launch is an event with a date' },
          { quote: 'to June', why: 'moving to a later month, not falling over' },
        ],
        paraphrase: 'The launch will probably be pushed back to June.',
        paraphraseGloss: '发布可能会推迟到六月。',
        sense: null,
      },
    ],
  },
  {
    sentence: 'Investors are still trying to gauge how much the stronger dollar will weigh on earnings.',
    results: [
      {
        word: 'gauge',
        surface: 'gauge',
        meaningHere: 'To estimate or judge something that can’t be measured directly.',
        glossHere: '估计；判断',
        usualMeaning: 'a measuring instrument, like a fuel gauge',
        usualGloss: '仪表',
        clues: [
          { quote: 'trying to', why: 'a verb here — an action, not an instrument' },
          { quote: 'how much … will weigh', why: 'a future effect you can only estimate' },
        ],
        paraphrase: 'Investors are still working out how much the stronger dollar will hurt company profits.',
        paraphraseGloss: '投资者仍在评估美元走强会在多大程度上拖累企业盈利。',
        sense: { meaning: 0, definition: 0 },
      },
      {
        word: 'weigh on',
        surface: 'weigh on',
        meaningHere: 'To have a negative effect on something; to drag it down.',
        glossHere: '拖累；压制',
        usualMeaning: 'to measure how heavy something is',
        usualGloss: '称重',
        clues: [{ quote: 'weigh on earnings', why: 'finance news: a burden on profits, not a scale' }],
        paraphrase: 'How much will the stronger dollar drag down earnings?',
        paraphraseGloss: '美元走强会对盈利造成多大拖累？',
        sense: null,
      },
    ],
  },
];

// ---------- Podcast lines (text only) ----------

const line = (
  text: string, before: string, after: string, show: string, kind: 'everyday' | 'work',
  episode: string, published: string, start: number, sense: Sense | null,
): PodcastClip & { sense: Sense | null } =>
  ({ text, before, after, show, kind, episode, published, start, end: start + 6, clipPath: null, audioUrl: '', sense });

const CLIPS: DemoFixture['clips'] = {
  appall: [
    line('I was appalled by my fasting blood glucose and by my postprandial blood glucose levels.',
      'I was wearing a continuous glucose monitor when I became a new mother.', 'Postprandial? Postprandial means after a meal.',
      'The Diary Of A CEO', 'everyday', 'Anti-Aging Expert: Stop Touching Receipts Immediately!', '2026-03-30', 1535.8, { meaning: 0, definition: 0 }),
  ],
  'go against the grain': [
    line('I have to go against the grain, which is why it was hard for the last sort of few years.',
      '', 'Whatever the current regime is, I have to say the wrong thing.',
      'SmartLess', 'everyday', 'RE-RELEASE: Ricky Gervais', '2025-02-13', 1744.1, { meaning: 0, definition: 1 }),
    line('Yeah. And I think that’s where it almost goes against the grain again, doesn’t it?',
      '', 'Because we’re kind of taught to believe there’s this undercurrent in our culture…',
      'The Diary Of A CEO', 'everyday', 'World Leading Psychologist: How To Detach From Overthinking & Anxiety', '2022-03-03', 1794.5, { meaning: 0, definition: 1 }),
  ],
  gauge: [
    line('Okay. I think there are three ways, though, to try to gauge whether you’re at risk of escalation.',
      'I don’t think you ever know for sure.', 'Okay. So the first way is to set yourself conditions in advance…',
      'The Mel Robbins Podcast', 'everyday', 'How to Unlock Your Full Potential with #1 Professor Adam Grant', '2026-10-22', 624.4, { meaning: 0, definition: 0 }),
    line('And then you’re trying to gauge, like, you don’t want to be the weird old guy at a wedding.',
      '', 'I’m just aware of it.',
      'Armchair Expert', 'everyday', 'Ashe', '2026-10-14', 744.0, { meaning: 0, definition: 0 }),
  ],
  headwind: [
    line('And they’ve got this headwind of they just switched away from paying people to do distribution.',
      '', 'Yep. And the initial IPO target had been $150 million, so they’re still below that six years in.',
      'Acquired', 'work', 'Vanguard', '2026-05-17', 5944.6, { meaning: 1, definition: 0 }),
  ],
  clip: [
    line('Um, I’ve got a, I was looking at some of those early clips of you performing.',
      'So you went to that comedy show.', 'It’s funny cause I think this is the early two thousands.',
      'The Diary Of A CEO', 'everyday', 'Kevin Hart: They’re Lying To You About How To Become A Millionaire!', '2025-11-20', 1318.1, { meaning: 0, definition: 0 }),
    line('And suddenly, I would play with those paper clips and the pens, which were becoming starships.',
      'The only things that you would have there was paper clips and some pens and so on.', 'But that was our childhood.',
      'The Honest Drink (THD)', 'everyday', '#197 – David Ammerschlaeger: Artificially Human', '2026-10-20', 2418.4, { meaning: 0, definition: 1 }),
  ],
};

// ---------- Ask Lexi ----------

const ASK_LEXI: DemoFixture['askLexi'] = [
  {
    question: 'What’s the difference between appall and shock?',
    keys: ['appal', 'shock'],
    answer: `Both mean something upset you — appall adds a moral judgement.

Shock = surprise + upset. It doesn't say anyone did wrong.
"The news shocked everyone."

Appall = shocked AND disapproving: you think it's wrong or unacceptable.
"I was appalled by how they treated the staff."

Quick test: if you'd also say "that's not OK", use appall. If you were just caught off guard, use shock.

Stronger still: horrify — fear or disgust, often at something violent.`,
  },
  {
    question: '表示“审慎乐观”用英文怎么说？',
    keys: ['审慎乐观'],
    answer: `Best fit: cautiously optimistic（审慎乐观）
"Management is cautiously optimistic about the second half."

Close options:
guardedly optimistic — a touch more reserved; common in news and earnings calls.
hopeful but realistic — more conversational.

Avoid "carefully optimistic" — it isn't idiomatic.`,
  },
];

const COMPARISONS: SynonymComparison[] = [
  {
    word1: 'appall',
    word2: 'shock',
    word3: 'horrify',
    sharedMeaning: 'All three describe a strong, unpleasant reaction to something unexpected.',
    keyDifference: 'Shock is about surprise; appall adds moral disapproval; horrify adds fear or disgust.',
    word1Nuance: 'You are shocked and you judge it as wrong or unacceptable. Common for behaviour, decisions and standards.',
    word1Example: 'Shareholders were appalled by the size of the CEO’s pay rise.',
    word2Nuance: 'The neutral word: sudden surprise and upset, with no judgement about blame.',
    word2Example: 'The sudden resignation shocked the market.',
    word3Nuance: 'The strongest: fear, disgust or revulsion, often at something violent or grotesque.',
    word3Example: 'Viewers were horrified by the footage of the crash.',
  },
];

// ---------- Notebook, review queue and progress ----------

const DAY = 24 * 60 * 60 * 1000;

const srs = (dueInDays: number, reps: number, interval: number): SrsState =>
  ({ interval, ease: 2.5, due: daysFromToday(dueInDays), reps, lapses: 0 });

export const buildDemoFixture = (): DemoFixture => {
  const now = Date.now();
  const saved = (entry: WordEntry, daysAgo: number, extra: Partial<WordEntry> = {}): WordEntry => ({
    ...entry,
    timestamp: now - daysAgo * DAY,
    syncStatus: 'synced',
    ...extra,
  });

  const notebookList: WordEntry[] = [
    // In rotation and due today
    saved(appall, 9, { srs: srs(0, 1, 1) }),
    saved(stretchedThin, 6, { srs: srs(0, 1, 1) }),
    saved(gauge, 14, {
      srs: srs(0, 2, 3), // reps 2 → shown as a reverse card (definition first)
      contexts: [{
        id: 'demo-gauge-1',
        sourceTitle: 'The Mel Robbins Podcast · 10:24',
        fullText: 'I don’t think you ever know for sure. Okay. I think there are three ways, though, to try to gauge whether you’re at risk of escalation.',
        targetSentence: 'Okay. I think there are three ways, though, to try to gauge whether you’re at risk of escalation.',
        explanation: gauge.meanings[0].definitions[0].definition,
        usageNuance: 'Heard in “How to Unlock Your Full Potential with #1 Professor Adam Grant”',
        timestamp: now - 3 * DAY,
        sense: { meaning: 0, definition: 0 },
      }],
    }),
    // Reviewed recently, due later
    saved(clip, 11, {
      srs: srs(3, 3, 6),
      contexts: [{
        id: 'demo-clip-1',
        sourceTitle: 'From your reading',
        fullText: SENTENCES[0].sentence,
        targetSentence: SENTENCES[0].sentence,
        explanation: SENTENCES[0].results[0].meaningHere,
        usageNuance: SENTENCES[0].results[0].clues.map(c => `${c.quote} — ${c.why}`).join('; '),
        timestamp: now - 11 * DAY,
        sense: { meaning: 0, definition: 2 },
      }],
    }),
    // New cards waiting to enter the rotation
    saved(mullOver, 2),
    saved(againstTheGrain, 1),
    saved(headwind, 0.5, {
      contexts: [{
        id: 'demo-headwind-1',
        sourceTitle: 'From your reading',
        fullText: 'A stronger dollar remains a headwind for exporters this quarter.',
        targetSentence: 'A stronger dollar remains a headwind for exporters this quarter.',
        explanation: headwind.meanings[1].definitions[0].definition,
        usageNuance: 'a stronger dollar — a business condition, not weather',
        timestamp: now - 0.5 * DAY,
        sense: { meaning: 1, definition: 0 },
      }],
    }),
  ];
  // bludgeon is deliberately NOT in the notebook, so visitors can see a fresh lookup and "Save".

  const today = todayStr();
  return {
    entries: ENTRIES,
    notebook: Object.fromEntries(notebookList.map(w => [w.word, w])),
    sentences: SENTENCES,
    clips: CLIPS,
    askLexi: ASK_LEXI,
    comparisons: COMPARISONS,
    stats: {
      xp: 1840,
      streakCurrent: 12,
      streakBest: 21,
      lastActiveDate: today,
      achievements: {},
      totals: { reviews: 312, practices: 41, podcasts: 18, speaking: 9 },
      daily: { date: today, reviews: 0, newCards: 0, practices: 0, savedWords: 0, podcasts: 0, speaking: 0, completedQuests: [] },
    },
    suggestions: {
      words: ['bludgeon', 'clip', 'mull over', 'stretched thin', 'go against the grain', 'headwind'],
      sentences: SENTENCES.map(s => s.sentence),
      ask: ASK_LEXI.map(a => a.question),
    },
  };
};
