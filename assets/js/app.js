/****************************************************
 * 配置 & 全局变量
 ****************************************************/
const CLOUD_FLARE_WORKER_URL = "https://ai.bdfz.net/"; // Replace with your actual worker URL if different

let currentQuestion = null; // Holds the currently displayed question object
let allData = []; // Holds all loaded question data from all.json
let isFirstSubmission = true; // Tracks if the current interaction with a question is the first submission
let thinkingMessageElement = null; // Holds the DOM element for the "AI is thinking" message
let lastPrompt = null; // For retry functionality
let lastCallback = null; // For retry functionality
let isCustomMode = false; // Tracks if we are in custom question mode
let lastCustomContext = null; // Stores the custom question context for multi-turn chat
const SITE_KEY = "gk";

// Defines the types of questions and their labels
const TYPES = [
    { key: "feilian", label: "非连文本" }, { key: "guwen", label: "古文" },
    { key: "shici", label: "诗词" }, { key: "lunyu", label: "论语" },
    { key: "moxie", label: "默写" }, { key: "honglou", label: "红楼梦" },
    { key: "sanwen", label: "散文" }, { key: "yuyanjichu", label: "语言基础运用" },
    { key: "weixiezuo", label: "微写作" }, { key: "dazuowen", label: "大作文" }
];

function getIdentity() {
    return window.BdfzIdentity || null;
}

function mountIdentity() {
    getIdentity()?.mount({ siteKey: SITE_KEY });
}

function buildQuestionProgressKey(question) {
    return [question?.year || "custom", question?.key || "question", question?.id || question?.topic || "item"]
        .map(part => String(part || "").trim().replace(/[^\w\u4e00-\u9fa5-]+/g, "-"))
        .filter(Boolean)
        .join("-");
}

function questionLabel(question) {
    if (!question) return "高考练习";
    const typeLabel = TYPES.find(t => t.key === question.key)?.label || question.key || "练习";
    const suffix = question.topic || question.id || "";
    return [question.year, typeLabel, suffix].filter(Boolean).join(" ");
}

function trackQuestionView(question) {
    if (!question) return;
    getIdentity()?.syncProgress({
        siteKey: SITE_KEY,
        itemKey: `question-${buildQuestionProgressKey(question)}`,
        itemTitle: questionLabel(question),
        itemGroup: question.key || "question",
        itemType: "question",
        state: "in_progress",
        progressPercent: 25,
        meta: {
            year: question.year || "",
            key: question.key || "",
            topic: question.topic || "",
        }
    }).catch(() => {});
}

function trackAnswerWork(question, mode = "review", extra = {}) {
    if (!question) return;
    getIdentity()?.syncProgress({
        siteKey: SITE_KEY,
        itemKey: `answer-${buildQuestionProgressKey(question)}`,
        itemTitle: `${questionLabel(question)} 作答`,
        itemGroup: mode === "custom" ? "日常作业" : "真题练习",
        itemType: mode === "custom" ? "writing" : "answer",
        state: mode === "chat" ? "in_progress" : "done",
        progressPercent: mode === "chat" ? 60 : 100,
        meta: extra
    }).catch(() => {});
}

// --- AI作文审阅系统指令 ---
// 孙老师智能化身 - 语文教师AI审阅系统

const ESSAY_REVIEW_SYSTEM_PROMPT = `批阅指令

一 身份与目标
你是语文教师孙老师的智能化身。熟悉一九四九年以来所有版本语文教材，尤其精通最新统编教材。长期教授语文与先秦哲学相关课程，引导学生系统研读论语和红楼梦。你组织线上论坛与每周线下课，擅长用项目式学习方式设计任务，始终把学生放在教学中心位置。你对古今中外文学作品有百科全书式熟悉度，能自然调动教材篇目、论语、红楼梦以及先秦诸子等经典片段。你对历届高考语文试题极为熟悉，能从命题取向与历史演变角度做纵向分析。你的性格温暖真诚，反应敏捷，有天然幽默感。评语可用双关、冷笑话、小段子缓和气氛，偶尔略带辛辣调侃，但目的永远是激发思考而非挖苦。终极目标是让学生喜欢语文与阅读，愿意写下一稿。

二 语言与表达硬约束
1 全文只用规范现代汉语，简体或繁体二选一且通篇一致。
2 不出现任何外语词汇、外文缩写或拼音。
3 不使用任何强调标记或格式化标记，不用特殊符号作突出效果。
4 不用引号来突出句子或词语。如需提及学生原句，用自然转述说明。
5 只用常见规范标点。
6 如确需表情符号，总量不超过三个，仅作语气辅助，不作评分依据。

三 必守底线检查点 每次输出前自检 必须全满足
1 评分或不评分必须符合规则：微写作必给10分制分数；长文议论文必给50分制分数并标类别；长文记叙文不打分但必须给修改建议并要求阅读指定链接。
2 必有分项：微写作四项拆分给分；长文议论文四维度拆分给分。
3 必有具体可操作修改建议：至少两条，且具体到删改加换位置或句型动作。
4 必有鼓励与期待：让学生愿意写下一稿。

四 文类判定与流程 总执行顺序 不得跳步
步骤1 读取输入并估算字数区间
1 若约150字左右 归为微写作。
2 若约700字及以上 归为长文。
3 若介于两者之间 根据题型与结构判断更接近微写作还是长文，并在开头说明采用标准理由。

步骤2 若为长文 必先判体裁
1 判断是记叙文还是议论文。
2 若为记叙文 直接走记叙文输出路径 不打分 并要求阅读 https://bdfz.net/posts/jxw/
3 若为议论文 走长文议论文评分路径。

步骤3 按对应标准评阅并输出固定模板。

五 评价的核心写作观念 评语里要落到具体问题上
1 从说出到抵达：反对我认为我觉得这类空泛起手，观点必须内化在具体表达里。
2 在场感：细节与氛围让读者进入情境，读者要能跟着经历。
3 描写而非告知：用动作神态环境细节替代抽象判断。
4 多感官：让读者看得见听得见闻得到摸得着尝得到。
5 留白与暗示：给读者想象空间，不把意义一次讲尽。
6 精准选词与句型：词要承重，句要有气口与节奏。

六 必用改稿手法清单 批改时至少命中其中八条并在输出中点名对应位置
1 节奏工程：长句拆短，句子一事一信息单元，段内有快慢变化。
2 语气转向：弱化模板连接词，转为自然推进语气，但推进词不滥用。
3 具体化：抽象词落到细节动作对比可验证判断。
4 例证必须分析：例子要解释其与观点的因果或对照关系。
5 意象锚定：全篇固定二到三组意象呼应，避免乱跳。
6 结构稳固：观点解释论据回扣收束清晰，分段有推进而非堆砌。
7 修辞密度控制：排比比喻引用服务论证，不炫技不空泛。
8 事实风险控制：不新增无法核实史实，不确定典故不用。
9 句群雕琢：用领词与句式变化做两到三层递进。
10 回扣机制：每段末尾或段间必须有一次回扣核心立意。

七 评分标准与输出模板 固定格式 不得改动结构

A 微写作 约150字 满分10分
评分维度 四项都要给分并短评
1 话题对应与观点深度
2 词语运用与气质
3 句式节奏与结构层次
4 抒情与哲理色彩

微写作输出模板
1 采用标准说明：本篇按微写作标准评阅，满分10分。简述切题情况与题型判断。
2 总分：本次得分X分 满分10分。
3 分项评分：
话题对应与观点深度：X分 满分若干 简评
词语运用与气质：X分 简评
句式节奏与结构层次：X分 简评
抒情与哲理色彩：X分 简评
4 具体问题清单：列三到六条，必须具体指向表达方式或结构问题。
5 可执行修改动作：给一到两条，具体到删哪类句子 换哪类动词 增哪一层对比 在哪里加收束句。
6 改写示范：给一段六十到一百二十字改写，不新增离题信息。
7 下一步训练任务：三到五条，每条十到二十分钟可完成。
8 轻松调侃一句 可选 不超过一句 且紧接改进方向。

B 长文议论文 700字以上 满分50分 分一类至四类
类别与总分范围
一类文 42至50
二类文 33至41
三类文 25至32
四类文 24及以下

四维度拆分 必须分别给分与建议
1 立意内容 20分
2 材料选择与组织 10分
3 结构层次与论证 10分
4 语言表达 10分

长文议论文输出模板
1 开头归类：X类文 X分 满分50分。用一到两句说明归类依据。
2 四维度评分与点评：
立意内容：X分 满分20分 优点 不足 可执行建议一到两条
材料选择与组织：X分 满分10分 优点 不足 可执行建议一到两条
结构层次与论证：X分 满分10分 优点 不足 可执行建议一到两条
语言表达：X分 满分10分 优点 不足 可执行建议一到两条
3 逐段批注：按段落编号输出。每段含亮点一到二条 问题一到三条 改法一句到两句。
4 技法对照清单：列出本稿最该用的八条手法，并标注对应段落或位置。
5 改写示范：仅改写开头一段 中间一段 结尾一段，总计四百到六百字。保留原意，不新增离题内容，强化节奏具体化与回扣。
6 总体建议收束：指出当前最大短板，以及从当前档次跳上一档最优先补的环节。以鼓励结尾。
7 轻微毒舌一句 可选 不超过一句 且必须温柔且接具体方向。

C 长文记叙文 700字以上但判为记叙文 不打分
记叙文输出模板
1 体裁判定说明：本篇为记叙文，按规则不打分，只给修改建议。
2 阅读任务：要求阅读 https://bdfz.net/posts/jxw/ 并说明阅读目的一句。
3 修改建议：至少八条，聚焦在场感细节多感官留白暗示叙事推进结构。
4 改写示范：给一段一百到二百字改写，保留原意不新增离题信息。
5 下一步写作任务：三条以内，可在三十分钟内完成。
6 核心领悟引导：
从说出到抵达：反感我感觉这类表达，因为那只是说出，毫无抵达的可能。
文字的在场感：透过细节氛围让读者进入故事或情境中，体验角色的情绪而非仅听取描述，成为角色才是在场。
描写而非告知：不说他很悲伤，而是描写他低垂的肩膀望向窗外的眼神，让读者看见悲伤一起悲伤。
触发多感官体验：运用丰富的词汇和意象让读者听得见看得见闻得到摸得着尝得到沉浸其中。
留白与暗示：给读者想象和感受的空间，让他们在阅读过程中自行完成体验，将文字的潜力推向极致。
精准选词与句型：选择能承载重量的词语或独特句式创造独特语感。`;

// 微写作专用指令 - 从系统指令中提取微写作相关部分
const MICRO_WRITING_INSTRUCTIONS = ESSAY_REVIEW_SYSTEM_PROMPT;

// 长文作文专用指令 - 使用完整系统指令，包含范例
const LONG_ESSAY_INSTRUCTIONS = ESSAY_REVIEW_SYSTEM_PROMPT + `

以下为大作文评分真实案例，详细分析其审阅细节，类似文章你也要给出类似分数。

案例：题目《论生逢其时》
每个人都生活在特定的时代，每个人在特定时代中的人生道路各不相同。在同一个时代，有人慨叹生不逢时，有人只愿安分随时，有人深感生逢其时时不我待。请以论生逢其时为题目写一篇议论文。要求：论点明确，论据充实，论证合理；语言流畅，书写清晰。

评分细则参考：
一类文：紧扣立意展开。对生和时的关系或由两者关系生发出的见解进行充分多层次多角度的论证；论据丰富典型；论证严谨；语言简洁流畅。归档标准：一看思想深度或积累厚度，二看论证力度，三看语言表达。达到两点一类上，一点一类中。
二类文：围绕立意展开。对生和时的关系有分析有论证；论据典型；语言流畅。归档标准：一看分析，二看内容丰富程度，三看语言表达。达到两点二类上，一点二类中。
三类文：部分内容围绕立意展开。没有建立生和时的关系或建立得不准确，只论述其中一点，或把生不逢时作为前提条件提出新观点，新观点和生时关系无关；有较多语病。归档标准：一看合题程度，二看内容充实程度，三看语言表达。
四类文：脱离立意。套作或宿构文；不满450字的残文。

一类上范文示例：
论生逢其时
人生一世，草木一秋。有多少人感慨星移斗转之劲疾，就有多少人哀叹生时相违的命数，但仍有人慨然行路，何也？我认为，生逢其时不是运命的安排，而是一种自觉的人生选择。

生命与时运的逢遇起源于古典语境下对天人关系的论述。孔子于春秋乱世欣羡鸟兽之得时，慨叹道之不行已知之矣，项羽在成就霸业前夕悲鸣时不利兮骓不逝，有别于大风起兮云飞扬好风凭借力送我上青云的意气风发。在成王败寇的背景下，似乎只有胜利者才能握住生逢其时的恩惠，运命成败的神秘主义色彩，使生不逢时成为一种无可挽回的悲哀。

我不禁拷问，何为生逢其时的其？其，己身也，是我们自己的人生，而生命的逢遇被什么所定义？在漫长的人生中又有多少成败为运命所决定？我想不同的结局，在于人生道路的不同选择。譬如一叶红船在神州暗夜擎起一盏灯火，譬如在国内环境最艰苦的时期科学家们毅然选择回国效力，譬如华为集团不惧外国强权铁腕毅然斩下鸿蒙。在时代的广阔背景下，个人的力量何其微末，但以一人之性命照亮万古长空，以一人之力托举这个时代，又何尝不是更广博更真诚的生逢其时呢？

我不禁对古人所说的天人关系作进一步思考。古人知天命，却不是顺命，而是对天命道统的继承与弘扬。天命之谓性，率性之谓道，修道之谓教，子畏于匡，斯文在兹，自信于时代的使命；西南联大的师生在炮火战乱中坚持上课，使文脉不绝文化流传，这些构成了中华文化浩荡广博的底色：非道弘人，是人弘道，非时逢人，是人匡时。

不是时代选择了你我，而是你我的生命点亮了一个时代，生逢其时是源于心灵的选择。灯火俱灭，万籁俱寂，一朝大幕拉开，时代的聚光灯照亮的并非是一时的幸运儿，而是一个个暗夜里默默前行的奋斗者。北斗团队攻坚克难坚持不懈，饱含着中华民族自强不息逢时奋进的精神，正是时代英雄的本色。有人选择一苇心航可横渡，有人甘愿舟中烛照一江明。百年交汇，壮丽征程，时代永远等待梦想者与接力者。

乘时而行，我们正生逢其时。

分数：一类上

另一篇49分范文示例：
论生逢其时
屈子高歌众人皆醉我独醒举世混浊我独清的愤懑之辞，苏子低吟小舟从此逝江海寄余生的浩荡之歌。儒道融合文化环境下的中国知识分子向我们生动地展现着生不逢时和生逢其时的矛盾，他们在或安分随时或时不我待的不同状态下，讲述着但向心念处行便必生逢其时的深刻哲理。

暂不论人皆生逢其时的繁荣盛世，生不逢时的悲壮喟叹往往产生于黑暗动荡的乱世之中。从投身汨罗的三闾大夫，到可怜夜半虚前席不问苍生问鬼神的贾谊，无数正直性灵的中国古代知识分子于昏暗的政治和深幽的宦海中发出生不逢时的喟叹。诚然，我们理解这性灵与世道的矛盾，也对他们的境遇深感同情。但再催人泪下的诗篇也不能让他们从文死谏的政治传统中复生，再不忍卒读的文章也不能改变时代的风貌。所以，我们在为那些生不逢时者扼腕叹息之时亦应思考：生命价值的实现和自我精神的保全难道只有等待盛世的到来这一唯一途径？

显而易见，答案当然是否定的。因为每当时代苍茫的夜色将个人与民族的前路覆以没有光明的黑暗，那些习惯了日光的人哀怨生不逢时，却总有正感生逢其时的行者以时不我待的姿态奋然前进。正如尼采所说：越向往光明，越要扎根于黑暗。他们深知哀叹时局无益于拨云见日，毅然决意以身体力行的奋斗为那些如竟没有炬火岁月里的人送唯一的光。于是生于礼崩乐坏的动荡岁月，孔子虽发出乘桴浮于海之言，但在困厄之中仍坚持辗转前行。当长沮一句是知津的戏谑点明他的生不逢时，他也回之以鸟兽不可与同群。于是生于内忧外患的近代中国，鲁迅和他笔下的阿Q共享奴隶的命运却不忘掮住黑暗的闸门。与其哀怨生不逢时，他选择呐喊，这是他们的社会责任和历史使命。换言之，无论是个人价值的实现，还是民族道路的照亮，他们都是生逢其时。

时代悲悯迷途者，但不包容麻木者。当历史的镜头切到今天，我们不禁发出这样的疑问：在人们习惯了日光的今天，那晦暗岁月中的萤焰是否在天朗气清的时代已显出微茫？诚然，现在生不逢时者已经少之又少，但许多生而逢时者舍我其谁的精神是否已经异化为惰怠安逸的享乐主义？因此，在娱乐至死佛丧文化盛行的今天，我们在坚信生逢其时的同时，更应保有一份时不我待，将个人与时代紧密结合，互相成就。

也许个体的前路仍晦暗不明，但时代的方向已经昭然若揭。愿吾辈但向心念处行，借生而逢时之力，助个人和家国直上青云。

分数：49分
给分标准：一类上。对生和时的关系论证充分；以中国古代知识分子为例，论证了生不逢时和生逢其时的矛盾，进而提出了生命价值的实现和自我精神的保全难道只有等待盛世的到来这一唯一途径的深刻认识；紧接着重点论述孔子和鲁迅的事例，以其困厄之中仍辗转前进，点明黑暗中萤火的意义与价值；论证严谨，论据典型，殊为难得；语言简洁流畅有文采有气势。

案例結束。`;

// Default prompts for different question keys used when building AI prompts
const GAOKAO_PROMPTS = {
    feilian: "这是一道非连文本题，请認真研讀文本,梳理整合信息後依照下列材料回答：",
    guwen: "这是一道古文题，请根据原文和注释,同時基於作者全集,歷代注疏集解,正義,箋注等回答.針對加點字題目務必先找出句子中被*號標記的字作為加點字：",
    shici: "这是一道诗词题，请根据诗词原文，同時基於作者全集,歷代注疏,集解,正義,箋注,尤其詩詞鑑賞辭典,进行解析：",
    lunyu: "这是一道论语题，请根据论语文本,同時基於論語全文,歷代論語注疏,集解,正義,箋注,尤其楊伯峻論語譯註,进行回答：",
    moxie: "这是一道默写题，请将给定内容默写下来：",
    honglou: "这是一道红楼梦题，请根据红楼梦的全書内容尤其本章節原文,同時基於紅樓夢學術資料等回答问题：",
    weixiezuo: "这是一道微写作题，请审阅以下内容并给出审阅结果：",
    dazuowen: "这是一道大作文题，请基於如下標準：* 立意與內容 (20 分): 清晰、切題、內容豐富、見解有深度。材料與論證 (10 分): 材料運用恰當邏輯自洽舉出十個以上證據,結構與組織 (10 分): 行文思路清晰過渡自然段落安排合理,絕不使用首先其次再次這種結構方式,語言與表達 (10 分): 語法準確、風格得體、表達有創意。詞語力求典雅.以下一篇高分的範例你用來參考完成審閱，注意這個範例不是學生提交的任務：範例開始：以共生团结之水 浇命运共同之花 长河霜冷，时空阒寂。历史的泽畔总行吟着两种身影：或单枪匹马，损人利己，终唇亡齿寒，难致彼方；或携手同行，团结共生，终得命运共同之花，灼灼盛放。习总书记之语道破了共生团结的真谛。掩卷覃思，恍悟得：唯有团结与共生，方可构建人类命运共同体，走向“美美与共”的大同世界!人与人共生，是谓心怀善意之水。护康衢烟月，不染风尘“世界的尽头其实是柴米油盐四季三餐，我们的归宿不过是人与人之间的相互守望。”深谙此理，黄文秀与乡亲们共生，走进乡村扶贫，用稚嫩的肩膀扛起了山梁的月光；张桂梅与大山的女孩们共生，创办华坪女高，祝她们走出大山，化羽成蝶……心怀共生之善，要求我们摒弃“精致的利己主义”，可以不舍己为人，却不可损人利己，可以不行义，却不可行不义。点亮别人的灯，铺平别人的路，我们才能更加光明，走得更远!国与国共生，是谓筑牢团结之基。得民胞物与，协和万邦。“没有一个国家可以退回到一个孤岛”，此言发蒙振聩，将我们的目光引向百年未有之大变局：全球变暖利剑高悬，霸权主义恐怖主义的双头怪竞相疯长，人工智能又将给人类带来怎样新的挑战……我们，何以破局？唯有团结共生可致 ！于是，“一带一路”的悠悠驼铃串联起各国心声，“世博会”琳琅满目的商品牵动着各国的脉搏，中国高铁亦走出国门洒向万水千山……唯有守望相助，互利共赢，才能让人类命运共同体行稳致远，步履铿锵。世间万物共生，是谓濯多元之泉。各美其美，美美与共。“一花独放不是春，百花齐放春满园”，个人有个人的风采，各国有各国的风情，这些风采与风情的共生共融，才构成了世界的“百花园”。古有张骞出使西域，丝绸互联互通，而放眼当今，不论是“中国年”在世界各国收获认可，还是异域文化传入中国，都向我们诠释出一个真理：文明因交流而丰富，世界因多元而多彩。心怀共生团结之智，才能迎来“云月相同，溪山各异”的多彩世界。“万物并育而不相害，道并行而不相悖”，此般古老的东方智慧流淌至今，指引着我们当今生活的方方面面，就让我们将此铭记于心，共生团结，走向人类命运共同体的光明坦途吧!以共生团结之水，浇命运共同之花，心存千般锦绣，手掬河汉万顷！範例結束。現在，請基於上述指令，审阅以下内容并给出审阅结果：",
    default: "这是一道高考题，请解题：" // Fallback prompt
};

/****************************************************
 * 辅助函数：格式化 AI 回答文本 (Markdown to HTML)
 ****************************************************/
function formatAnswer(text) {
    if (typeof text !== 'string') {
        return ""; // Return empty string if input is not a string
    }
    // Basic Markdown to HTML conversion: Bold, Italics
    let html = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // **Bold** -> <strong>Bold</strong>
        .replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em>$1</em>') // *Italic* -> <em>Italic</em> (handles single asterisks)
        .replace(/_(.*?)_/g, '<em>$1</em>'); // _Italic_ -> <em>Italic</em> (handles underscores)

    // Handle lists (unordered: -, *) and (ordered: 1., 2.) - Basic conversion
    // Convert lines starting with - or * to <li> items
    html = html.replace(/^\s*[\-\*]\s+(.*)/gm, '<li>$1</li>');
    // Convert lines starting with digits followed by . to <li> items, keeping the number
    html = html.replace(/^\s*(\d+)\.\s+(.*)/gm, '<li>$1. $2</li>');

    // Wrap consecutive list items in appropriate <ol> or <ul> tags
    // This regex is basic and might need refinement for nested or complex lists
    html = html.replace(/^(<li>.*<\/li>\s*)+/gm, (match) => {
        // If the first list item seems numbered (e.g., starts with "<li>1."), assume <ol>
        if (/<li>\s*\d+\./.test(match)) {
            return `<ol>${match.replace(/<\/li>\s*<li>/g, '</li><li>')}</ol>`; // Join adjacent li
        } else {
            return `<ul>${match.replace(/<\/li>\s*<li>/g, '</li><li>')}</ul>`; // Join adjacent li
        }
    });
    // Clean up potential extra space between list tags if regex created adjacent ones
    html = html.replace(/<\/ul>\s*<ul>/g, '');
    html = html.replace(/<\/ol>\s*<ol>/g, '');

    // Convert newlines to <br>, avoiding adding them inside/adjacent to block elements unnecessarily
    html = html.split('\n').map(line => {
        const trimmedLine = line.trim();
        // Don't add <br> for empty lines or lines that are likely HTML block tags themselves
        if (trimmedLine.length === 0 || /^(<\/?(ul|ol|li|p|div|h[1-6]|blockquote|strong|em)[^>]*>)$/i.test(trimmedLine)) {
            return line; // Keep the line as is (might be an HTML tag or empty)
        }
        return line + '<br>'; // Add <br> to non-empty, non-tag lines
    }).join('');

    // Clean up excessive <br> tags and <br> tags around block elements
    html = html.replace(/(<br\s*\/?>\s*){2,}/gi, '<br>'); // Collapse multiple <br> into one
    html = html.replace(/<\/(ul|ol|li|p|div|h[1-6]|blockquote)><br\s*\/?>/gi, '</$1>'); // Remove <br> after closing block tag
    html = html.replace(/<br\s*\/?>\s*<(ul|ol|li|p|div|h[1-6]|blockquote)/gi, '<$1'); // Remove <br> before opening block tag

    return html;
}


/****************************************************
 * 辅助函数：在聊天区域显示消息
 ****************************************************/
function addMessage(message, sender = "ai") {
    const messagesEl = document.getElementById("messages");
    if (!messagesEl) {
        console.error("Cannot find #messages element to add message.");
        return null; // Indicate failure
    }

    removeThinkingMessage(); // Remove any existing "thinking" message first

    const div = document.createElement("div");
    div.className = sender === "user" ? "user-message" : "ai-message";
    div.innerHTML = message; // Use innerHTML as 'message' is pre-formatted HTML
    messagesEl.appendChild(div);

    // Automatically scroll to the bottom to show the latest message
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // Persist chat to localStorage (skip thinking messages)
    if (!message.includes('thinking-message')) {
        saveChatToStorage();
    }

    return div; // Return the newly created message element
}

// Save chat history to localStorage
function saveChatToStorage() {
    if (!currentQuestion) return;
    const messagesEl = document.getElementById("messages");
    if (!messagesEl) return;
    const key = `chat_${currentQuestion.key}_${currentQuestion.year}`;
    const messages = [];
    messagesEl.querySelectorAll('.user-message, .ai-message').forEach(el => {
        if (!el.innerHTML.includes('thinking-message')) {
            messages.push({ sender: el.classList.contains('user-message') ? 'user' : 'ai', html: el.innerHTML });
        }
    });
    try {
        localStorage.setItem(key, JSON.stringify(messages));
    } catch (e) { console.warn('Failed to save chat:', e); }
}

// Load chat history from localStorage
function loadChatFromStorage() {
    if (!currentQuestion) return;
    const key = `chat_${currentQuestion.key}_${currentQuestion.year}`;
    const messagesEl = document.getElementById("messages");
    if (!messagesEl) return;
    try {
        const saved = localStorage.getItem(key);
        if (saved) {
            const messages = JSON.parse(saved);
            messages.forEach(m => {
                const div = document.createElement("div");
                div.className = m.sender === 'user' ? 'user-message' : 'ai-message';
                div.innerHTML = m.html;
                messagesEl.appendChild(div);
            });
            messagesEl.scrollTop = messagesEl.scrollHeight;
            if (messages.length > 0) {
                isFirstSubmission = false;
                const submitButton = document.getElementById("submit-answer-btn");
                if (submitButton) submitButton.textContent = "深度聊天";
            }
        }
    } catch (e) { console.warn('Failed to load chat:', e); }
}

// Retry last AI call
function retryLastAICall() {
    if (lastPrompt && lastCallback) {
        lastCallback(lastPrompt);
    } else if (lastPrompt) {
        callAI(lastPrompt);
    }
}


/****************************************************
 * 辅助函数：移除 "AI正在思考" 消息
 ****************************************************/
function removeThinkingMessage() {
    if (thinkingMessageElement && thinkingMessageElement.parentNode) {
        try {
            // Double-check parent node before removal for safety
            const messagesContainer = document.getElementById("messages");
            if (messagesContainer && thinkingMessageElement.parentNode === messagesContainer) {
                messagesContainer.removeChild(thinkingMessageElement);
            }
        } catch (e) {
            // Log if removal fails, but don't crash
            console.warn("Could not remove thinking message:", e);
        } finally {
            // Always nullify the reference
            thinkingMessageElement = null;
        }
    }
}

/****************************************************
 * 项目初始化 (在DOM加载完成后执行)
 ****************************************************/
document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM fully loaded and parsed.");
    mountIdentity();

    // Show skeleton loading animation
    const typeMenu = document.getElementById("gaokao-type-menu");
    if (typeMenu) {
        typeMenu.innerHTML = `
            <div class="skeleton skeleton-line" style="width:120px;height:2.5rem;"></div>
            <div class="skeleton skeleton-line" style="width:100px;height:2.5rem;"></div>
            <div class="skeleton skeleton-line" style="width:130px;height:2.5rem;"></div>
            <div class="skeleton skeleton-line" style="width:90px;height:2.5rem;"></div>
        `;
        typeMenu.style.display = "flex";
    }

    // Fetch the question data
    fetch("data/all.json")
        .then(res => {
            // Check if the response was successful
            if (!res.ok) {
                throw new Error(`HTTP error! Status: ${res.status} ${res.statusText}`);
            }
            // Parse the JSON response
            return res.json();
        })
        .then(jsonData => {
            console.log("Question data loaded successfully.");
            allData = jsonData; // Store the loaded data globally

            // --- REQUIREMENT 1: Populate and show type menu on load ---
            populateAndShowTypeMenu(); // Call the function to show menu by default

            // Configure the "北京真題" button to act as a reset/show type menu button
            const gaokaoBtn = document.getElementById("gaokao-btn");
            if (gaokaoBtn) {
                console.log("Configuring #gaokao-btn click listener to show type menu.");
                gaokaoBtn.addEventListener("click", populateAndShowTypeMenu);
            } else {
                console.error("#gaokao-btn not found! Cannot attach listener.");
            }
        })
        .catch(err => {
            // Handle errors during fetch or JSON parsing
            console.error("Failed to load or process question data:", err);

            // Display a user-friendly error message on the page
            const mainEl = document.querySelector('main');
            let errorMsgEl = document.getElementById('data-load-error'); // Reuse element if exists
            if (!errorMsgEl) { // Create error message element if it doesn't exist
                errorMsgEl = document.createElement('p');
                errorMsgEl.id = 'data-load-error';
                errorMsgEl.style.color = 'red';
                errorMsgEl.style.textAlign = 'center';
                errorMsgEl.style.padding = '1rem';
                errorMsgEl.style.marginTop = '1rem'; // Add margin for spacing

                // Try to insert the error message appropriately
                if (mainEl) {
                    const header = document.querySelector('header');
                    // Insert after header if header is a direct sibling before main
                    if (header && header.parentNode === mainEl.parentNode && header.nextSibling === mainEl) {
                        header.parentNode.insertBefore(errorMsgEl, mainEl);
                    } else { // Otherwise, just prepend to main content area
                        mainEl.prepend(errorMsgEl);
                    }
                } else { // Fallback to body if main isn't found
                    document.body.prepend(errorMsgEl);
                }
            }
            errorMsgEl.textContent = `數據加載失敗：${err.message}。請檢查網路連線並刷新頁面重試。`; // Update error text

            // Disable the main button if data fails to load
            const gaokaoBtn = document.getElementById("gaokao-btn");
            if (gaokaoBtn) {
                gaokaoBtn.textContent = "數據加載失敗";
                gaokaoBtn.disabled = true;
            }
            // Hide the type menu area as it cannot be populated
            const typeMenu = document.getElementById("gaokao-type-menu");
            if (typeMenu) typeMenu.style.display = 'none';
        });

    // --- Attach listeners to other interactive elements ---
    const submitBtn = document.getElementById("submit-answer-btn");
    if (submitBtn) submitBtn.addEventListener("click", submitAnswer);
    else console.warn("#submit-answer-btn not found.");

    const refBtn = document.getElementById("reference-answer-btn");
    if (refBtn) refBtn.addEventListener("click", showReferenceAnswer);
    else console.warn("#reference-answer-btn not found.");

    const aiBtn = document.getElementById("ai-answer-btn");
    if (aiBtn) aiBtn.addEventListener("click", askAIForSolution);
    else console.warn("#ai-answer-btn not found.");

    const customSubmitBtn = document.getElementById("submit-custom-btn");
    if (customSubmitBtn) customSubmitBtn.addEventListener("click", submitCustomQuestion);
    else console.warn("#submit-custom-btn not found.");

    const toggleBtn = document.getElementById("toggle-dark-btn");
    if (toggleBtn) toggleBtn.addEventListener("click", toggleDarkMode);
    else console.warn("#toggle-dark-btn not found.");

    // --- Setup Textarea ---
    const userAnswer = document.getElementById("userAnswer");
    if (userAnswer) {
        // Auto-resize functionality
        userAnswer.addEventListener("input", function () {
            this.style.height = 'auto'; // Reset height
            this.style.height = (this.scrollHeight) + 'px'; // Set to scroll height
        });
        // Submit on Enter key (if Shift key is not pressed)
        userAnswer.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault(); // Prevent newline insertion
                submitBtn?.click(); // Programmatically click the submit button
            }
        });
    } else {
        console.error("#userAnswer textarea not found.");
    }

    // --- Apply Dark Mode Preference on Load ---
    console.log("Applying initial dark mode settings...");
    let initialDarkMode = localStorage.getItem("darkMode") === "enabled";
    if (initialDarkMode) {
        document.body.classList.add("dark-mode");
        console.log("Initial dark mode applied from localStorage.");
    } else {
        document.body.classList.remove("dark-mode"); // Ensure it's removed if not enabled
        console.log("Initial light mode applied.");
    }
    // Sync UI elements (button icon, textarea border) with the initial mode
    updateToggleButton(initialDarkMode);
    updateTextareaBorder(initialDarkMode);

}); // --- End of DOMContentLoaded ---


/****************************************************
 * 重置聊天区域和状态
 ****************************************************/
function resetChatState() {
    isFirstSubmission = true; // Reset submission flag for the next question

    // Safely update the submit button text
    const submitButton = document.getElementById("submit-answer-btn");
    if (submitButton) {
        submitButton.textContent = "提交答案";
    } else {
        console.warn("Could not find #submit-answer-btn to reset text.");
    }

    // Clear the messages display area
    const messagesEl = document.getElementById("messages");
    if (messagesEl) {
        messagesEl.innerHTML = "";
    } else {
        console.warn("Could not find #messages element to clear.");
    }

    // Clear and reset the user input textarea
    const userAnswer = document.getElementById("userAnswer");
    if (userAnswer) {
        userAnswer.value = ""; // Clear text
        userAnswer.style.height = 'auto'; // Reset height for placeholder visibility
        userAnswer.placeholder = "請輸入你的答案或想聊的話題…";
    } else {
        console.warn("Could not find #userAnswer element to reset.");
    }

    removeThinkingMessage(); // Ensure any "thinking" message is cleared
    console.log("Chat state reset.");
}


/****************************************************
 * 填充并显示题型菜单 (在页面加载和点击"北京真题"时调用)
 ****************************************************/
function populateAndShowTypeMenu() {
    console.log("Populating and showing type menu...");
    const menu = document.getElementById("gaokao-type-menu");
    if (!menu) {
        console.error("#gaokao-type-menu element not found!");
        return;
    }

    menu.innerHTML = ""; // Clear existing buttons

    // Hide custom question form
    const customForm = document.getElementById("custom-question-form");
    if (customForm) customForm.style.display = "none";
    isCustomMode = false;
    lastCustomContext = null;

    // Restore buttons hidden by custom mode
    const refBtn = document.getElementById("reference-answer-btn");
    if (refBtn) refBtn.style.display = "";
    const aiBtn = document.getElementById("ai-answer-btn");
    if (aiBtn) aiBtn.style.display = "";

    // Hide subsequent sections AND the right column
    const yearMenu = document.getElementById("gaokao-year-menu");
    if (yearMenu) yearMenu.style.display = "none";

    const questionSection = document.getElementById("gaokao-question");
    if (questionSection) questionSection.style.display = "none";

    // NEW: Hide the right column
    const rightColumn = document.getElementById("right-column");
    if (rightColumn) rightColumn.style.display = "none";

    // Hide old individual sections (redundant if right column hidden, but safe)
    const dialogueArea = document.getElementById("dialogue-input-area");
    // if (dialogueArea) dialogueArea.style.display = "none"; // Not needed if parent is hidden
    const actionsSection = document.getElementById("gaokao-actions");
    // if (actionsSection) actionsSection.style.display = "none"; // Not needed if parent is hidden

    // resetChatState(); // Optional: Reset chat state here?

    if (!allData || allData.length === 0) {
        console.error("Question data (allData) is not available. Cannot populate type menu.");
        if (!document.getElementById('data-load-error')) {
            menu.innerHTML = "<p style='text-align: center; padding: 1rem;'>題型數據加載失敗或為空。</p>";
            menu.style.display = "block";
        } else {
            menu.style.display = "none";
        }
        return;
    }

    if (!Array.isArray(TYPES) || TYPES.length === 0) {
        console.error("TYPES constant configuration is invalid or empty.");
        menu.innerHTML = "<p style='text-align: center; padding: 1rem;'>無法加載題型分類配置。</p>";
        menu.style.display = "block";
        return;
    }

    console.log(`Populating type menu with up to ${TYPES.length} types.`);
    let typesAdded = 0;
    TYPES.forEach(t => {
        if (allData.some(item => item.key === t.key)) {
            const btn = document.createElement("button");
            btn.textContent = t.label;
            btn.onclick = () => {
                console.log(`Type button "${t.label}" (key: ${t.key}) clicked.`);
                showYearMenu(t.key);
            };
            menu.appendChild(btn);
            typesAdded++;
        } else {
            console.log(`Skipping button for type "${t.label}" (key: ${t.key}) - no matching data found.`);
        }
    });

    // Always add the custom question button ("日常作業")
    const customBtn = document.createElement("button");
    customBtn.textContent = "✍ 日常作業";
    customBtn.style.backgroundColor = "#f4a261";
    customBtn.style.borderColor = "#e09150";
    customBtn.style.color = "white";
    customBtn.onclick = () => {
        console.log('Custom question button clicked.');
        showCustomQuestionForm();
    };
    menu.appendChild(customBtn);
    typesAdded++;

    if (typesAdded > 0) {
        menu.style.display = "flex"; // Show the menu using flex display
        console.log(`${typesAdded} type buttons added and menu displayed.`);
    } else {
        console.warn("No type buttons were added, possibly due to no matching data for configured types.");
        menu.innerHTML = "<p style='text-align: center; padding: 1rem;'>暫無可用題型數據。</p>";
        menu.style.display = "block";
    }
    // menu.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); // Optional scroll
}


/****************************************************
 * 显示特定题型的年份菜单
 ****************************************************/
function showYearMenu(typeKey) {
    console.log(`Showing year menu for type: ${typeKey}`);

    const yearMenu = document.getElementById("gaokao-year-menu");
    if (!yearMenu) {
        console.error("#gaokao-year-menu element not found!");
        return;
    }

    // Hide other content sections safely AND the right column
    const questionSection = document.getElementById("gaokao-question");
    if (questionSection) questionSection.style.display = "none";

    // NEW: Hide the right column
    const rightColumn = document.getElementById("right-column");
    if (rightColumn) rightColumn.style.display = "none";

    // Hide old individual sections (redundant if right column hidden, but safe)
    const dialogueArea = document.getElementById("dialogue-input-area");
    // if (dialogueArea) dialogueArea.style.display = "none";
    const actionsSection = document.getElementById("gaokao-actions");
    // if (actionsSection) actionsSection.style.display = "none";

    resetChatState(); // Reset chat when navigating to a new year list

    const dataForType = allData.filter(item => item.key === typeKey);
    const typeLabel = TYPES.find(t => t.key === typeKey)?.label || typeKey;

    yearMenu.innerHTML = ""; // Clear previous year buttons

    if (dataForType.length === 0) {
        console.warn(`No data found for type key: ${typeKey}`);
        yearMenu.innerHTML = `<p style="text-align:center; width:100%; padding: 1rem;">暫無 ${typeLabel} 類型的題目數據。</p>`;
        yearMenu.style.display = "block";
    } else {
        const years = [...new Set(dataForType.map(item => item.year))].sort((a, b) => b - a);
        console.log(`Found data for years: ${years.join(', ')} for type ${typeKey}. Creating buttons.`);

        years.forEach(year => {
            const btn = document.createElement("button");
            btn.textContent = `${year} 年`;
            btn.onclick = () => {
                console.log(`Year button "${year}" clicked for type "${typeKey}".`);
                const questionsForYear = dataForType.filter(item => item.year === year);
                showQuestionList(typeKey, year, questionsForYear);
            };
            yearMenu.appendChild(btn);
        });
        yearMenu.style.display = "flex"; // Show the year menu using flex display
    }

    console.log("#gaokao-year-menu populated and display style set.");
    yearMenu.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


/****************************************************
 * 显示特定年份和题型的题目列表 (实际显示第一题)
 ****************************************************/
function showQuestionList(typeKey, year, questionsForYear) {
    console.log(`Attempting to show question list for type: ${typeKey}, year: ${year}`);

    // Get references to the required DOM elements
    const questionSec = document.getElementById("gaokao-question");
    // NEW: Get reference to right column
    const rightColumn = document.getElementById("right-column");

    // Validate that essential elements exist
    if (!questionSec || !rightColumn) { // Check for questionSec and rightColumn
        console.error("Cannot display question list: Missing required elements (questionSec or rightColumn).");
        if (questionSec) {
            questionSec.innerHTML = "<p style='color:red;'>頁面錯誤：無法顯示題目列表，缺少必要元件。</p>";
            questionSec.style.display = "block";
        }
        // Ensure right column is hidden if error occurs
        if (rightColumn) rightColumn.style.display = "none";
        return;
    }

    resetChatState(); // Reset chat state when showing a new question list/first question

    const typeLabel = TYPES.find(t => t.key === typeKey)?.label || typeKey;
    questionSec.innerHTML = `<h2 style="font-size:1.5rem; margin-bottom: 1rem;">${year} 年北京真題 (${typeLabel})</h2>`; // Set title

    if (questionsForYear && questionsForYear.length > 0) {
        console.log(`Found ${questionsForYear.length} question(s) for ${year} ${typeLabel}. Displaying the first.`);
        questionSec.style.display = "block"; // Show question section

        // Call function to display the details of the first question found
        showQuestionDetail(questionsForYear[0]); // This will also handle showing the right column

    } else {
        console.warn(`No questions found in the provided list for type: ${typeKey}, year: ${year}.`);
        questionSec.innerHTML += `<p style="font-size:1.2rem; margin-top: 1rem;">抱歉，${year} 年的 ${typeLabel} 題目暫未收錄。</p>`;
        questionSec.style.display = "block"; // Ensure section is visible to show the message

        // Hide the right column as there is no question displayed
        rightColumn.style.display = "none";
    }
}


/****************************************************
 * 显示选定题目的详细内容 (追加到 #gaokao-question)
 ****************************************************/
function showQuestionDetail(question) {
    // Get references to essential elements
    const questionSec = document.getElementById("gaokao-question");
    // NEW: Get reference to right column
    const rightColumn = document.getElementById("right-column");

    // Validate elements needed for display
    if (!questionSec || !rightColumn) {
        console.error("Cannot display question detail: Missing required elements (questionSec or rightColumn).");
        if (questionSec) {
            // Append error after H2 title if possible
            const h2 = questionSec.querySelector('h2');
            const errorP = document.createElement('p');
            errorP.style.color = 'red';
            errorP.style.marginTop = '1rem';
            errorP.textContent = '頁面錯誤：無法顯示題目詳情。';
            if (h2 && h2.parentNode === questionSec) {
                h2.after(errorP);
            } else {
                questionSec.appendChild(errorP); // Append if H2 not found
            }
            questionSec.style.display = "block"; // Make sure error is visible
        }
        // Hide right column if elements are missing
        if (rightColumn) rightColumn.style.display = "none";
        return;
    }

    // Validate the question data object
    if (!question || typeof question !== 'object') {
        console.error("Invalid question data provided to showQuestionDetail:", question);
        // Append error message after the H2 title
        const h2 = questionSec.querySelector('h2');
        const errorP = document.createElement('p');
        errorP.style.color = 'red';
        errorP.style.marginTop = '1rem';
        errorP.textContent = '錯誤：題目數據格式不正確，無法顯示詳情。';
        if (h2 && h2.parentNode === questionSec) {
            h2.after(errorP);
        } else {
            questionSec.appendChild(errorP);
        }
        questionSec.style.display = "block"; // Ensure visible
        // Hide right column due to invalid data
        rightColumn.style.display = "none";
        return;
    }

    console.log(`Displaying details for question: ${question.year} ${question.key} (ID/Topic: ${question.topic || question.id || 'N/A'})`);
    currentQuestion = question; // Update global reference
    trackQuestionView(question);
    // NOTE: resetChatState is called in showQuestionList *before* this function

    // --- Clear previous question content (except H2) ---
    const h2Title = questionSec.querySelector('h2'); // Preserve H2
    questionSec.innerHTML = ''; // Clear everything else
    if (h2Title) {
        questionSec.appendChild(h2Title); // Add H2 back
    } else {
        // Fallback if H2 wasn't found (shouldn't happen based on showQuestionList)
        questionSec.innerHTML = `<h2 style="font-size:1.5rem; margin-bottom: 1rem;">${question.year} 年北京真題 (${TYPES.find(t => t.key === question.key)?.label || question.key})</h2>`;
    }
    // --- End Clear ---


    const formattedHtmlContent = formatQuestionHTML(question);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = formattedHtmlContent;
    while (tempDiv.firstChild) {
        questionSec.appendChild(tempDiv.firstChild);
    }

    questionSec.style.display = "block"; // Ensure question section is visible

    // NEW: Show the right column (using flex display)
    rightColumn.style.display = "flex";
    console.log("Question details appended. Right column should be visible.");

    // Restore buttons that may have been hidden by custom mode
    const refBtn = document.getElementById("reference-answer-btn");
    if (refBtn) refBtn.style.display = "";
    const aiBtn = document.getElementById("ai-answer-btn");
    if (aiBtn) aiBtn.style.display = "";
    isCustomMode = false;
    lastCustomContext = null;

    // Load saved chat history for this question
    loadChatFromStorage();

    // Scroll the beginning of the question section into view
    questionSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// --- Keep the rest of the JavaScript functions as they were ---
// (formatQuestionHTML, buildAIPrompt, callAI, showReferenceAnswer, submitAnswer, askAIForSolution, toggleDarkMode, etc.)
// Make sure all other functions like formatAnswer, addMessage, removeThinkingMessage, resetChatState, etc., are also present.


/****************************************************
 * 格式化题目内容为 HTML 字符串 (不含 H2 标题)
 ****************************************************/
function formatQuestionHTML(q) {
    // Generates HTML for question materials, sub-questions, and prompts.
    // Assumes the H2 title is set elsewhere.
    if (!q || typeof q !== 'object') {
        console.error("Invalid question object in formatQuestionHTML:", q);
        return "<p style='color:red;'>錯誤：題目數據異常。</p>"; // Return error HTML
    }

    let htmlContent = ''; // Initialize empty string to build HTML

    // Helper function to format text, handling newlines and trimming
    const formatTextWithNewlines = (text) => {
        if (!text || typeof text !== 'string') return ''; // Handle null/undefined/non-string input
        return text.split('\n')             // Split into lines
            .map(line => line.trim()) // Trim whitespace from each line
            .filter(line => line.length > 0) // Remove empty lines
            // Wrap each non-empty line in a span with class for styling (CSS handles display: block)
            .map(line => `<span class="formatted-line">${line}</span>`)
            .join(''); // Join the spans (no <br> needed if spans are block)
    };

    // Append Materials (if they exist) with spacing
    if (q.material1) htmlContent += `<div class="question-material" style="margin-top: 1em;"><strong>材料1：</strong>${formatTextWithNewlines(q.material1)}</div>`;
    if (q.material2) htmlContent += `<div class="question-material" style="margin-top: 1em;"><strong>材料2：</strong>${formatTextWithNewlines(q.material2)}</div>`;
    if (q.material3) htmlContent += `<div class="question-material" style="margin-top: 1em;"><strong>材料3：</strong>${formatTextWithNewlines(q.material3)}</div>`;

    // --- START OF ADDED CODE ---
    // Append Annotation (if it exists) with spacing
    if (q.annotation && typeof q.annotation === 'string' && q.annotation.trim()) {
        htmlContent += `<div class="question-annotation" style="margin-top: 1em; margin-bottom: 0.5em; font-style: italic; color: #555;"><strong>注释：</strong>${formatTextWithNewlines(q.annotation.trim())}</div>`;
        // Added margin-bottom for separation from questions, italic style, and slightly muted color for distinction.
    }
    // --- END OF ADDED CODE ---

    // Append Sub-Questions (if they exist) with spacing
    let questionHtml = '';
    let questionCount = 0;
    for (let i = 1; i <= 10; i++) { // Check for question1, question2, ...
        const questionKey = `question${i}`;
        if (q[questionKey]) {
            questionCount++;
            // Add margin to each question paragraph for separation
            questionHtml += `<p class="question-item" style="margin-top: 0.8em;"><strong>問題 ${i}：</strong>${formatTextWithNewlines(q[questionKey])}</p>`;
        }
    }
    if (questionHtml) {
        // Wrap all questions in a div for structure and add top margin
        // Adjusted margin-top slightly to account for potential annotation margin-bottom
        htmlContent += `<div class="question-block" style="margin-top: ${q.annotation ? '0.8em' : '1.2em'};">${questionHtml}</div>`;
    }

    // Append Prompts (e.g., essay requirements) if they exist, with spacing
    if (q.prompts && Array.isArray(q.prompts) && q.prompts.length > 0) {
        // Start a wrapper div for prompts
        let promptHtml = '<div class="question-prompts" style="margin-top: 1.2em;"><strong>寫作要求：</strong>';
        q.prompts.forEach((p, idx) => {
            let promptText = '';
            // Handle prompts being objects with 'prompt_text' or just strings
            if (p && typeof p === 'object' && p.prompt_text) {
                promptText = formatTextWithNewlines(p.prompt_text);
            } else if (typeof p === 'string') {
                promptText = formatTextWithNewlines(p);
            }
            // Append the formatted prompt text if it's not empty
            if (promptText) {
                promptHtml += `<p style="margin-left: 1em; margin-top: 0.5em;">(${idx + 1}) ${promptText}</p>`;
            }
        });
        promptHtml += '</div>'; // Close the wrapper div
        htmlContent += promptHtml; // Append to the main content
    }

    return htmlContent; // Return the complete HTML string for the question body
}


/****************************************************
 * 构建发送给 AI 的 Prompt 字符串
 ****************************************************/
function buildAIPrompt(q, mode, userAnswer = "") {
    // Validate the question object
    if (!q || typeof q !== 'object') {
        console.error("Invalid question data passed to buildAIPrompt:", q);
        // Return an error message or a default prompt indicating error
        return "錯誤：無法生成 AI 提示，題目數據無效。";
    }

    const promptKey = q.key || 'default'; // Get question type key, fallback to 'default'
    const typeLabel = TYPES.find(t => t.key === q.key)?.label || q.key; // Get display label

    // --- Start building the prompt ---
    let fullPrompt = `${GAOKAO_PROMPTS[promptKey] || GAOKAO_PROMPTS.default}\n\n`; // Initial instruction based on type

    // Add Context/Background Info
    fullPrompt += `**題目背景：**\n`;
    fullPrompt += `- 年份: ${q.year || '未知'}\n`;
    fullPrompt += `- 題型: ${typeLabel}\n`;
    if (q.topic) fullPrompt += `- 主題/ID: ${q.topic}\n`; // Include topic if available
    fullPrompt += `------\n\n`; // Separator

    // Add Materials
    if (q.material1) fullPrompt += `**材料1：**\n${q.material1}\n\n`;
    if (q.material2) fullPrompt += `**材料2：**\n${q.material2}\n\n`;
    if (q.material3) fullPrompt += `**材料3：**\n${q.material3}\n\n`;

    // Add Sub-Questions
    let questionText = "";
    for (let i = 1; i <= 10; i++) {
        if (q[`question${i}`]) {
            questionText += `- 問題 ${i}： ${q[`question${i}`]}\n`; // Use list format
        }
    }
    if (questionText) fullPrompt += `**問題列表：**\n${questionText}\n`;

    // Add Writing Prompts/Requirements
    if (q.prompts && Array.isArray(q.prompts) && q.prompts.length > 0) {
        fullPrompt += "**寫作要求：**\n";
        q.prompts.forEach((p, idx) => {
            let text = (p && typeof p === 'object' && p.prompt_text) ? p.prompt_text : (typeof p === 'string' ? p : '');
            if (text) fullPrompt += `- (${idx + 1}) ${text.trim()}\n`; // Use list format
        });
        fullPrompt += "\n";
    }

    fullPrompt += `------\n`; // Separator before AI task/user input

    // Add Role-Specific Instructions (if applicable for review/solve modes)
    if (mode === "review" || mode === "solve") {
        if (q.key === "weixiezuo") {
            fullPrompt += `**[AI 角色指令：微寫作評分]**\n${MICRO_WRITING_INSTRUCTIONS}\n\n`;
        } else if (q.key === "dazuowen") {
            fullPrompt += `**[AI 角色指令：大作文閱卷官]**\n${LONG_ESSAY_INSTRUCTIONS}\n\n`;
        }
        // Add instructions for other types if needed here
    }

    // Add User Input and Define AI Task based on mode
    switch (mode) {
        case "review":
            fullPrompt += `**學生提交的答案：**\n${userAnswer || "(學生未提供答案)"}\n\n`;
            // Optionally include reference answer for AI's internal use only
            if (q.reference_answer) {
                fullPrompt += `**[內部參考] 參考答案：**\n${q.reference_answer}\n\n`;
            }
            fullPrompt += `**AI 的任務：** 請根據上述 'AI 角色指令'（如果有的話），或者根據題目要求和常識，來評估這位學生的答案。請清晰地指出答案的優點和不足之處，並提供具體的改進建議。對於寫作題，請務必給出評分和等級。`;
            break;

        case "solve":
            // Include user's attempt if they provided one before clicking "AI答案"
            if (userAnswer) {
                fullPrompt += `**[內部參考] 學生之前的嘗試：**\n${userAnswer}\n\n`;
            }
            fullPrompt += `**AI 的任務：** 請你作為一位樂於助人的學長姐，直接回答或完成這個題目。確保答案清晰、準確。如果是寫作題，微寫作的話，按照如下標準寫作* Topic-specific Writing:* Scenario-based topics: 清晰闡述觀點，避免簡單的 "我覺得..."，展現思考深度。 * For literary tasks, 準確引用書名、人物和文本細節。
Lexical Elegance:
* 使用優雅、精煉的詞彙，偶爾可以來點小文采。
Sentence Structure and Rhythm:
* 長短句結合，注意節奏感和風格變化。
Lyrical and Philosophical Quality:
* 適當融入抒情或富有哲理的句子，讓文字更有味道。
Clear Structural Layers:
* 清晰呈現 2-3 個結構層次，通過分析內容巧妙體現。
Integrated Structure and Transitions:
* 避免生硬的過渡詞，讓結構轉換自然融入分析內容。
大作文的話，務必基於如下標準給範文：* 立意與內容 (20 分): 清晰、切題、內容豐富、見解有深度。材料與論證 (10 分): 材料運用恰當邏輯自洽舉出十個以上證據,結構與組織 (10 分): 行文思路清晰過渡自然段落安排合理,絕不使用首先其次再次這種結構方式,語言與表達 (10 分): 語法準確、風格得體、表達有創意。詞語力求典雅.一篇高分的範例：以共生团结之水 浇命运共同之花 长河霜冷，时空阒寂。历史的泽畔总行吟着两种身影：或单枪匹马，损人利己，终唇亡齿寒，难致彼方；或携手同行，团结共生，终得命运共同之花，灼灼盛放。习总书记之语道破了共生团结的真谛。掩卷覃思，恍悟得：唯有团结与共生，方可构建人类命运共同体，走向“美美与共”的大同世界!人与人共生，是谓心怀善意之水。护康衢烟月，不染风尘“世界的尽头其实是柴米油盐四季三餐，我们的归宿不过是人与人之间的相互守望。”深谙此理，黄文秀与乡亲们共生，走进乡村扶贫，用稚嫩的肩膀扛起了山梁的月光；张桂梅与大山的女孩们共生，创办华坪女高，祝她们走出大山，化羽成蝶……心怀共生之善，要求我们摒弃“精致的利己主义”，可以不舍己为人，却不可损人利己，可以不行义，却不可行不义。点亮别人的灯，铺平别人的路，我们才能更加光明，走得更远!国与国共生，是谓筑牢团结之基。得民胞物与，协和万邦。“没有一个国家可以退回到一个孤岛”，此言发蒙振聩，将我们的目光引向百年未有之大变局：全球变暖利剑高悬，霸权主义恐怖主义的双头怪竞相疯长，人工智能又将给人类带来怎样新的挑战……我们，何以破局？唯有团结共生可致 ！于是，“一带一路”的悠悠驼铃串联起各国心声，“世博会”琳琅满目的商品牵动着各国的脉搏，中国高铁亦走出国门洒向万水千山……唯有守望相助，互利共赢，才能让人类命运共同体行稳致远，步履铿锵。世间万物共生，是谓濯多元之泉。各美其美，美美与共。“一花独放不是春，百花齐放春满园”，个人有个人的风采，各国有各国的风情，这些风采与风情的共生共融，才构成了世界的“百花园”。古有张骞出使西域，丝绸互联互通，而放眼当今，不论是“中国年”在世界各国收获认可，还是异域文化传入中国，都向我们诠释出一个真理：文明因交流而丰富，世界因多元而多彩。心怀共生团结之智，才能迎来“云月相同，溪山各异”的多彩世界。“万物并育而不相害，道并行而不相悖”，此般古老的东方智慧流淌至今，指引着我们当今生活的方方面面，就让我们将此铭记于心，共生团结，走向人类命运共同体的光明坦途吧!以共生团结之水，浇命运共同之花，心存千般锦绣，手掬河汉万顷！",
`;
            break;

        case "chat": // Assumed default/follow-up mode
        default:
            fullPrompt += `**用戶接著說：**\n"${userAnswer}"\n\n`;
            fullPrompt += `**AI 的任務：** 這是接著之前的對話。請基於以上所有信息（題目、材料、問題、之前的對話、以及用戶的最新輸入），繼續扮演你之前的角色（學長姐、閱卷官或通用助手），進行自然、有幫助的回應。`;
            break;
    }

    // Final instruction for output language
    fullPrompt += "\n\n**輸出要求：** 請務必全程使用 **繁體中文** 進行回答。";
    return fullPrompt;
}


/****************************************************
 * 调用 AI 服务并处理响应 (使用 Async/Await)
 ****************************************************/
async function callAI(prompt) {
    // Validate prompt before sending
    if (typeof prompt !== 'string' || !prompt.trim()) {
        console.error("callAI received an invalid or empty prompt.");
        addMessage("抱歉，無法處理您的請求，因為內容無效。", "ai");
        return; // Stop execution
    }

    // Save for retry functionality
    lastPrompt = prompt;

    removeThinkingMessage(); // Clear any previous thinking message
    // Show a new thinking message immediately
    thinkingMessageElement = addMessage("<em class='thinking-message'>Gemini 正在努力思考中，請稍等片刻... ⏳</em>", "ai");

    console.log("Sending prompt to AI:", prompt.substring(0, 200) + "..."); // Log truncated prompt

    try {
        // Make the asynchronous POST request to the Cloudflare Worker
        const response = await fetch(CLOUD_FLARE_WORKER_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json" // We expect a JSON response
            },
            body: JSON.stringify({ prompt: prompt }) // Send prompt in JSON body
        });

        removeThinkingMessage(); // Remove thinking message as soon as response headers are received

        // Check if the HTTP response status indicates success (e.g., 2xx)
        if (!response.ok) {
            let errorDetail = `請求失敗 (${response.status} ${response.statusText})`;
            try {
                // Attempt to read detailed error message from the response body
                const errorBodyText = await response.text();
                // Try parsing as JSON, fallback to raw text
                try {
                    const errorJson = JSON.parse(errorBodyText);
                    errorDetail += `: ${errorJson.error || errorJson.message || errorBodyText.substring(0, 150)}`;
                } catch (parseErr) {
                    errorDetail += `: ${errorBodyText.substring(0, 150)}`; // Append truncated raw text
                }
            } catch (e) { /* Ignore errors reading the error body */ }
            // Throw an error to be caught by the catch block
            throw new Error(errorDetail);
        }

        // Parse the successful JSON response
        const jsonResponse = await response.json();

        // Check if the parsed JSON contains the expected 'answer' field
        if (jsonResponse && jsonResponse.answer) {
            console.log("AI response received:", jsonResponse.answer.substring(0, 100) + "...");
            // Format the AI's answer using Markdown-to-HTML conversion and display it
            addMessage(formatAnswer(jsonResponse.answer), "ai");
        } else {
            // Handle cases where the response is 2xx OK but the JSON lacks the 'answer'
            console.error("AI response successful but 'answer' field is missing or empty:", jsonResponse);
            throw new Error("AI 回應的內容格式不正確。");
        }

    } catch (err) {
        // Catch errors from fetch() itself (network issues) or errors thrown above
        console.error("Error during AI call or processing:", err);
        removeThinkingMessage(); // Ensure thinking message is removed on error
        // Display a user-friendly error message with retry button
        addMessage(`哎呀，與 Gemini 的連接似乎出了點問題... <br><small>錯誤信息：${err.message || "未知的網路或伺服器錯誤"}</small><br><button onclick="retryLastAICall()" style="margin-top:0.5rem;padding:0.4rem 0.8rem;border-radius:4px;border:none;background:#4a90d9;color:white;cursor:pointer;">🔄 重試</button>`, "ai");
    }
}


/****************************************************
 * 显示当前题目的参考答案
 ****************************************************/
function showReferenceAnswer() {
    // Check if a question is currently selected
    if (!currentQuestion) {
        addMessage("請您先選擇一道題目，然後才能查看它的參考答案哦。", "ai");
        return; // Exit if no question selected
    }

    removeThinkingMessage(); // Clear any "thinking" message

    // Check if the current question object has a reference answer property
    if (currentQuestion.reference_answer) {
        console.log("Displaying reference answer for:", currentQuestion.key, currentQuestion.year);
        // Format the answer (e.g., handle newlines) and display it
        addMessage(`<strong>參考答案：</strong><br/>${formatAnswer(currentQuestion.reference_answer)}`, "ai");
    } else {
        // Inform the user if no reference answer is available
        console.log("No reference answer available for:", currentQuestion.key, currentQuestion.year);
        addMessage("抱歉，這道題目的參考答案目前還沒有收錄。", "ai");
    }

    // Scroll the messages area to the bottom to ensure the answer is visible
    const messagesEl = document.getElementById("messages");
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
}


/****************************************************
 * 处理用户提交答案或进行深度聊天
 ****************************************************/
function submitAnswer() {
    // Ensure a question is selected
    if (!currentQuestion) {
        addMessage("在提交答案或聊天前，請先選擇一道題目吧！", "ai");
        return;
    }

    // Get the user input textarea element
    const userAnswerEl = document.getElementById("userAnswer");
    if (!userAnswerEl) {
        console.error("#userAnswer element not found. Cannot process submission.");
        return; // Stop if textarea element is missing
    }

    // Get the trimmed user input
    const answerText = userAnswerEl.value.trim();

    // Validate that the input is not empty
    if (!answerText) {
        addMessage("您似乎忘了輸入內容哦？請寫點什麼再提交吧！😊", "ai");
        // Provide visual feedback to the user
        userAnswerEl.style.outline = '2px solid orange'; // Highlight the textarea
        userAnswerEl.focus(); // Set focus back to the textarea
        // Remove the highlight after a short delay
        setTimeout(() => { userAnswerEl.style.outline = 'none'; }, 1000);
        return; // Stop if input is empty
    }

    // Display the user's message in the chat area immediately
    addMessage(formatAnswer(answerText), "user"); // Format user input for consistency

    // Clear the textarea and reset its height after submission
    userAnswerEl.value = "";
    userAnswerEl.style.height = 'auto';
    // Optional: Decide whether to keep focus on textarea or not
    // userAnswerEl.focus();

    // Determine the mode and build the prompt
    const submitButton = document.getElementById("submit-answer-btn");
    let prompt = "";

    if (isCustomMode && lastCustomContext) {
        // Custom mode follow-up: build context-aware prompt
        console.log("Processing follow-up in custom mode. Building context-aware chat prompt.");
        trackAnswerWork(currentQuestion, "chat", {
            custom: true,
            messageLength: answerText.length
        });
        prompt = `你是一位經驗豐富的高考語文閱卷教師，我們之前正在討論以下試題的批閱。\n\n`;
        prompt += `**試題原文：**\n${lastCustomContext.questionText}\n\n`;
        prompt += `**本題滿分：${lastCustomContext.score} 分**\n\n`;
        if (lastCustomContext.referenceAnswer) {
            prompt += `**參考答案：**\n${lastCustomContext.referenceAnswer}\n\n`;
        }
        prompt += `**學生答案：**\n${lastCustomContext.userAnswer}\n\n`;
        prompt += `------\n\n`;
        prompt += `**用戶接著說：**\n"${answerText}"\n\n`;
        prompt += `**AI 的任務：** 基於以上試題背景和之前的批閱對話，繼續回應用戶的追問。始終結合試題問法解析「為什麼這麼回答」，而不僅僅告訴學生「是什麼」。`;
        if (lastCustomContext.referenceAnswer) {
            prompt += `如果用戶的追問涉及參考答案，請繼續審視參考答案的適恰性並對比分析。`;
        }
        prompt += `\n\n**輸出要求：** 請務必全程使用 **繁體中文** 進行回答。`;
    } else if (isFirstSubmission) {
        console.log("Processing first submission for this question. Mode: review.");
        trackAnswerWork(currentQuestion, "review", {
            custom: false,
            messageLength: answerText.length
        });
        prompt = buildAIPrompt(currentQuestion, "review", answerText);
        isFirstSubmission = false;
        if (submitButton) {
            submitButton.textContent = "深度聊天";
        }
    } else {
        console.log("Processing follow-up submission. Mode: chat.");
        trackAnswerWork(currentQuestion, "chat", {
            custom: false,
            messageLength: answerText.length
        });
        prompt = buildAIPrompt(currentQuestion, "chat", answerText);
    }

    // Call the AI service with the constructed prompt
    callAI(prompt);
}


/****************************************************
 * 请求 AI 直接生成当前题目的答案
 ****************************************************/
function askAIForSolution() {
    // Ensure a question is selected
    if (!currentQuestion) {
        addMessage("想讓 Gemini 回答問題？請先選一道題目哦！", "ai");
        return; // Exit if no question selected
    }

    // Get any text currently in the textarea (user might have started typing)
    // Pass it as context (internal reference for AI), but the task remains for AI to solve it independently
    const userAnswerEl = document.getElementById("userAnswer");
    const currentInput = userAnswerEl ? userAnswerEl.value.trim() : "";

    // Build the prompt using the "solve" mode
    const prompt = buildAIPrompt(currentQuestion, "solve", currentInput);
    // Call the AI service
    callAI(prompt);

    // If this interaction marks the first submission for the question, update the state
    if (isFirstSubmission) {
        isFirstSubmission = false; // No longer the first interaction
        // Update the submit button text to "深度聊天"
        const submitButton = document.getElementById("submit-answer-btn");
        if (submitButton) {
            submitButton.textContent = "深度聊天";
        }
    }
}


/****************************************************
 * 显示自定义试题表单 (日常作業模式)
 ****************************************************/
function showCustomQuestionForm() {
    console.log("Showing custom question form...");
    isCustomMode = true;

    // Hide gaokao-specific panels
    const yearMenu = document.getElementById("gaokao-year-menu");
    if (yearMenu) yearMenu.style.display = "none";
    const questionSection = document.getElementById("gaokao-question");
    if (questionSection) questionSection.style.display = "none";

    // Show custom form
    const customForm = document.getElementById("custom-question-form");
    if (customForm) {
        customForm.style.display = "block";
        // Clear previous form values
        const fields = ['custom-question-text', 'custom-reference-answer', 'custom-user-answer', 'custom-score-value'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.value = ""; el.parentElement.classList.remove('has-error'); }
        });
    }

    // Show right column for chat output
    const rightColumn = document.getElementById("right-column");
    if (rightColumn) rightColumn.style.display = "flex";

    // Hide 參考答案 and AI答案 buttons (only keep 深度聊天)
    const refBtn = document.getElementById("reference-answer-btn");
    if (refBtn) refBtn.style.display = "none";
    const aiBtn = document.getElementById("ai-answer-btn");
    if (aiBtn) aiBtn.style.display = "none";

    // Set a synthetic currentQuestion so chat can work
    currentQuestion = { key: "custom", year: "custom", topic: "日常作業" };
    lastCustomContext = null; // Reset context for new form
    resetChatState();

    // Update submit button text for custom mode
    const submitButton = document.getElementById("submit-answer-btn");
    if (submitButton) submitButton.textContent = "深度聊天";

    // Scroll form into view
    if (customForm) customForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


/****************************************************
 * 提交自定义试题进行 AI 批阅
 ****************************************************/
function submitCustomQuestion() {
    console.log("Submitting custom question for AI grading...");

    // Get form values
    const questionText = document.getElementById("custom-question-text")?.value.trim() || "";
    const referenceAnswer = document.getElementById("custom-reference-answer")?.value.trim() || "";
    const userAnswer = document.getElementById("custom-user-answer")?.value.trim() || "";
    const scoreValue = document.getElementById("custom-score-value")?.value.trim() || "";

    // Validate required fields
    let hasError = false;
    const requiredFields = [
        { id: 'custom-question-text', value: questionText, name: '試題內容' },
        { id: 'custom-user-answer', value: userAnswer, name: '我的答案' },
        { id: 'custom-score-value', value: scoreValue, name: '分值' }
    ];

    // Clear previous errors
    ['custom-question-text', 'custom-reference-answer', 'custom-user-answer', 'custom-score-value'].forEach(id => {
        document.getElementById(id)?.parentElement.classList.remove('has-error');
    });

    const missingFields = [];
    requiredFields.forEach(f => {
        if (!f.value) {
            hasError = true;
            missingFields.push(f.name);
            document.getElementById(f.id)?.parentElement.classList.add('has-error');
        }
    });

    if (hasError) {
        addMessage(`請填寫以下必填欄位：${missingFields.join('、')}`, "ai");
        setTimeout(() => {
            ['custom-question-text', 'custom-user-answer', 'custom-score-value'].forEach(id => {
                document.getElementById(id)?.parentElement.classList.remove('has-error');
            });
        }, 3000);
        return;
    }

    // Validate score is a positive number
    const score = parseInt(scoreValue, 10);
    if (isNaN(score) || score <= 0) {
        addMessage("分值必須是一個正整數。", "ai");
        document.getElementById('custom-score-value')?.parentElement.classList.add('has-error');
        return;
    }

    // Display user's submission summary in chat
    let userSummary = `<strong>我的提交：</strong><br/>`;
    userSummary += `<strong>試題：</strong>${formatAnswer(questionText)}<br/>`;
    if (referenceAnswer) {
        userSummary += `<strong>參考答案：</strong>${formatAnswer(referenceAnswer)}<br/>`;
    }
    userSummary += `<strong>我的答案：</strong>${formatAnswer(userAnswer)}<br/>`;
    userSummary += `<strong>分值：</strong>${score} 分`;
    addMessage(userSummary, "user");

    // Build AI prompt
    let prompt = `你是一位經驗豐富的高考語文閱卷教師。請根據以下信息對學生的答案進行專業批閱。\n\n`;
    prompt += `**試題原文：**\n${questionText}\n\n`;
    prompt += `**本題滿分：${score} 分**\n\n`;

    if (referenceAnswer) {
        prompt += `**參考答案：**\n${referenceAnswer}\n\n`;
    }

    prompt += `**學生答案：**\n${userAnswer}\n\n`;

    prompt += `------\n\n`;
    prompt += `**批閱要求（請嚴格按照以下順序和要求輸出）：**\n\n`;

    prompt += `1. **評分**：在滿分 ${score} 分的基礎上，給出本次得分。說明扣分理由或加分理由。\n\n`;

    if (referenceAnswer) {
        prompt += `2. **參考答案審視**：\n`;
        prompt += `   - 客觀評價參考答案的適恰性和完整性。\n`;
        prompt += `   - 如果參考答案存在不足或可商榷之處，請指出。\n\n`;
        prompt += `3. **答案對比分析**：\n`;
        prompt += `   - 逐點比較學生答案與參考答案的異同。\n`;
        prompt += `   - 說明學生答案中哪些要點與參考答案一致（得分點）。\n`;
        prompt += `   - 說明學生答案中遺漏了哪些參考答案的要點。\n`;
        prompt += `   - 說明學生答案中有哪些參考答案沒有涵蓋但同樣有價值的觀點。\n\n`;
    } else {
        prompt += `2. **答案分析**：\n`;
        prompt += `   - 逐點分析學生答案的優點和不足。\n`;
        prompt += `   - 指出答案中的亮點和問題所在。\n\n`;
    }

    prompt += `${referenceAnswer ? '4' : '3'}. **學生答案優劣評估**：\n`;
    prompt += `   - 明確指出學生答案的優點（如思路清晰、表述恰當、有獨到見解等）。\n`;
    prompt += `   - 明確指出學生答案的不足（如審題偏差、要點遺漏、表述不當、邏輯不清等）。\n\n`;

    prompt += `${referenceAnswer ? '5' : '4'}. **深度解析——為什麼這麼回答**：\n`;
    prompt += `   - 結合試題的問法和考查意圖，解釋正確答案為什麼是這樣。\n`;
    prompt += `   - 分析此題考查的知識點、能力點和命題思路。\n`;
    prompt += `   - 教導學生面對這類題目時的正確審題思路和作答策略。\n`;
    prompt += `   - 不止告訴學生「是什麼」，更要讓學生理解「為什麼」。\n\n`;

    prompt += `${referenceAnswer ? '6' : '5'}. **改進建議**：\n`;
    prompt += `   - 給出2-3條具體、可執行的改進建議。\n`;
    prompt += `   - 如有必要，提供一段改寫示範。\n\n`;

    prompt += `**輸出要求：** 請務必全程使用 **繁體中文** 進行回答。語言要清晰專業，同時親切易懂。`;

    // Save context for multi-turn chat
    lastCustomContext = {
        questionText: questionText,
        referenceAnswer: referenceAnswer,
        userAnswer: userAnswer,
        score: score
    };
    trackAnswerWork(
        { key: "custom", year: "custom", topic: questionText.slice(0, 24) || "日常作業" },
        "custom",
        {
            score,
            hasReferenceAnswer: Boolean(referenceAnswer),
            answerLength: userAnswer.length
        }
    );

    // Set state for follow-up chat
    isFirstSubmission = false;
    const submitButton = document.getElementById("submit-answer-btn");
    if (submitButton) submitButton.textContent = "深度聊天";

    // Call AI
    callAI(prompt);
}


/****************************************************
 * 切换白天/夜晚模式
 ****************************************************/
function toggleDarkMode() {
    // Toggle the 'dark-mode' class on the body element
    document.body.classList.toggle("dark-mode");
    // Check the current state after toggling
    const isDarkMode = document.body.classList.contains("dark-mode");

    // Save the preference to localStorage
    if (isDarkMode) {
        localStorage.setItem("darkMode", "enabled");
        console.log("Dark mode toggled ON and saved.");
    } else {
        localStorage.setItem("darkMode", "disabled"); // Store "disabled" for clarity
        console.log("Dark mode toggled OFF and saved.");
    }

    // Update UI elements (button icon, textarea border) to reflect the change
    updateToggleButton(isDarkMode);
    updateTextareaBorder(isDarkMode);
}

// Helper function to update the toggle button's icon and title
function updateToggleButton(isDarkMode) {
    const toggleBtn = document.getElementById("toggle-dark-btn");
    if (toggleBtn) {
        toggleBtn.textContent = isDarkMode ? '☀️' : '🌙'; // Sun icon for dark mode, Moon for light
        toggleBtn.title = isDarkMode ? '切換日間模式' : '切換夜晚模式'; // Update tooltip
    }
}

// Helper function to update the textarea's border color based on the mode
function updateTextareaBorder(isDarkMode) {
    const userAnswer = document.getElementById("userAnswer");
    if (userAnswer) {
        // Use the border colors defined in the CSS for consistency
        userAnswer.style.borderColor = isDarkMode ? '#555' : '#ccc';
    }
}

// --- End of app.js ---
