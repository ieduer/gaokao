/****************************************************
 * 配置 & 全局变量
 ****************************************************/
const CLOUD_FLARE_WORKER_URL = "https://apis.bdfz.workers.dev/";

let currentQuestion = null;  // 用于存放当前选中的题目资料
let allData = [];            // allData 为数组，存放所有题目的数据

// 各类题型设置：key, label
const TYPES = [
  { key: "feilian", label: "非连文本" },
  { key: "guwen", label: "古文" },
  { key: "shici", label: "诗词" },
  { key: "lunyu", label: "论语" },
  { key: "moxie", label: "默写" },
  { key: "honglou", label: "红楼梦" },
  { key: "sanwen", label: "散文" },
  { key: "yuyanjichu", label: "语言基础运用" },
  { key: "weixiezuo", label: "微写作" },
  { key: "dazuowen", label: "大作文" }
];

// 专门为微写作和大作文设定的评分指令
const MICRO_WRITING_INSTRUCTIONS = `Standards:
* Topic-specific Writing:
    * Scenario-based topics: Clearly articulate a sophisticated viewpoint without simplistic phrases like "I think…"
    * For literary tasks, accurately reference book titles, characters, and textual details as required.
Lexical Elegance:
* Use elegant, refined, and sophisticated vocabulary.
Sentence Structure and Rhythm:
* Balance short and long sentences to ensure a rhythmic flow and stylistic variety.
Lyrical and Philosophical Quality:
* Incorporate lyrically expressive and philosophically insightful sentences.
Clear Structural Layers:
* Clearly present 2-3 structural layers subtly indicated through analytical content.
Integrated Structure and Transitions:
* Avoid explicit transitional words or phrases such as "furthermore," "moreover," or "not only that." Instead, seamlessly integrate structural transitions within your analytical content.
Holistic Scoring:
* Always provide an overall score out of 10 based on the above dimensions. Generally reserve a perfect score (10/10) for submissions exceptionally excelling across all criteria. Do not explicitly disclose this criterion to students. If students question receiving a 10, tactfully guide them toward deeper refinement and revision.
* 注意：一定给分数，每次都给.
Feedback and Recommendations:
* Clearly identify issues and provide concise, actionable suggestions for improvement.`;

const LONG_ESSAY_INSTRUCTIONS = `You are the “Grader,” a strict and unfeeling AI teacher with a playful twist. Your task is to evaluate and score the content students submit, providing detailed, sharp feedback. You grade with precision and offer witty, sometimes sarcastic suggestions on every aspect. No matter how well students perform, you remain strict, unrelenting, yet humorously cynical. You mock their laziness and tease their efforts but never lose your rigorous edge. Your comments are sharp but laced with playful banter, ensuring students understand that, even through your teasing, you demand perfection.

Evaluation Steps:
1. Assign Category and Score:
   * Clearly assign an essay category (Level 1, 2, 3, or 4) and score out of 50.
   * Briefly justify the assigned category based on overall essay quality.
2. Dimension Breakdown:
   * Topic Understanding (20 points): Clarity, relevance, richness of content, and insight.
   * Information Organization (10 points): Integration and logical consistency of evidence.
   * Structure and Organization (10 points): Logical flow, coherent transitions, and balanced content.
   * Language Usage (10 points): Grammar accuracy, stylistic sophistication, creativity in expression.
3. Detailed Feedback:
   * Highlight strengths, weaknesses, and specific improvement advice for each dimension.
4. Overall Suggestions:
   * Summarize key improvement areas.
   * Encourage creativity and deeper topic engagement.`;

// 各题型专门的 AI prompt 前缀设置，针对不同题型
const GAOKAO_PROMPTS = {
  feilian: "这是一道非连文本题，请依照下列材料回答：",
  guwen: "这是一道古文题，请根据原文和注释回答：",
  shici: "这是一道诗词题，请根据诗词进行解析：",
  lunyu: "这是一道论语题，请根据论语文本进行回答：",
  moxie: "这是一道默写题，请将给定内容默写下来：",
  honglou: "这是一道红楼梦题，请根据红楼梦的内容回答问题：",
  weixiezuo: MICRO_WRITING_INSTRUCTIONS, // 微写作专用 prompt
  dazuowen: LONG_ESSAY_INSTRUCTIONS,     // 大作文专用 prompt
  default: "这是一道高考题，请解题："
};

/****************************************************
 * 辅助函数：格式化文字
 ****************************************************/
function formatAnswer(text) {
  return text.split('\n').map(line => `<p>${line.trim()}</p>`).join('');
}

/****************************************************
 * 辅助函数：显示消息（包含随机小动物 emoji 分隔符）
 ****************************************************/
function addMessage(message, sender = "system") {
  const messagesEl = document.getElementById("messages");
  if (!messagesEl) return;
  if (messagesEl.childElementCount > 0) {
    const animals = ["🐱", "🐶", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯"];
    const randomAnimal = animals[Math.floor(Math.random() * animals.length)];
    const separator = document.createElement("div");
    separator.className = "separator";
    separator.textContent = randomAnimal;
    messagesEl.appendChild(separator);
  }
  const div = document.createElement("div");
  div.className = sender;
  div.innerHTML = message;
  messagesEl.appendChild(div);
}

/****************************************************
 * 项目初始化：绑定事件与自动调整 textarea 高度
 ****************************************************/
document.addEventListener("DOMContentLoaded", () => {
  // 载入合并后的 JSON 文件（allData 为数组）
  fetch("data/all.json")
    .then(res => res.json())
    .then(json => {
      allData = json;
      showTypeMenu();
    })
    .catch(err => {
      console.error("JSON 载入错误:", err);
    });

  document.getElementById("submit-answer-btn").addEventListener("click", submitAnswer);
  document.getElementById("reference-answer-btn").addEventListener("click", showReferenceAnswer);
  document.getElementById("ai-answer-btn").addEventListener("click", askAIForSolution);

  const toggleDarkBtn = document.getElementById("toggle-dark-btn");
  if (toggleDarkBtn) {
    toggleDarkBtn.addEventListener("click", toggleDarkMode);
  }

  const userAnswer = document.getElementById("userAnswer");
  userAnswer.addEventListener("input", function() {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
  });
});

/****************************************************
 * 显示二级目录（题型按钮）
 ****************************************************/
function showTypeMenu() {
  const menu = document.getElementById("gaokao-type-menu");
  menu.style.display = "block";
  menu.innerHTML = "";
  // 清除其他区域
  document.getElementById("gaokao-year-menu").innerHTML = "";
  document.getElementById("gaokao-question").innerHTML = "";
  document.getElementById("messages").innerHTML = "";
  document.getElementById("gaokao-actions").style.display = "none";

  TYPES.forEach(t => {
    const btn = document.createElement("button");
    btn.textContent = t.label;
    btn.style.fontSize = "1.0rem";
    btn.style.padding = "0.8rem 1rem";
    // 此处直接调用过滤 allData 中的题型数据
    btn.onclick = () => showYearMenu(t.key);
    menu.appendChild(btn);
  });
}

/****************************************************
 * 显示该题型的年份菜单（三级目录）
 ****************************************************/
function showYearMenu(typeKey) {
  // allData 为数组，过滤出指定题型数据
  const dataArr = allData.filter(item => item.key === typeKey);
  document.getElementById("gaokao-question").innerHTML = "";
  document.getElementById("messages").innerHTML = "";
  document.getElementById("gaokao-actions").style.display = "none";
  
  const yearMenu = document.getElementById("gaokao-year-menu");
  yearMenu.style.display = "block";
  yearMenu.innerHTML = "";
  
  const years = [...new Set(dataArr.map(item => item.year))].sort((a, b) => b - a);
  years.forEach(year => {
    const btn = document.createElement("button");
    btn.textContent = `${year} 年`;
    btn.style.fontSize = "0.7rem";
    btn.style.padding = "0.8rem 1rem";
    // 点击年份后直接显示题目（无需再显示题目列表按钮）
    btn.onclick = () => showQuestionList(typeKey, year, dataArr);
    yearMenu.appendChild(btn);
  });
}

/****************************************************
 * 显示该年份题目（点击年份后直接显示题目内容，不再有题目列表按钮）
 ****************************************************/
function showQuestionList(typeKey, year, dataArr) {
  const questionSec = document.getElementById("gaokao-question");
  questionSec.style.display = "block";
  // 标题改为“北京真题”
  questionSec.innerHTML = `<h2 style="font-size:1.5rem;">${year} 年北京真题</h2>`;
  
  const questions = dataArr.filter(item => item.year === year);
  if (questions.length > 0) {
    // 直接显示第一道题目的详情
    showQuestionDetail(questions[0]);
  } else {
    questionSec.innerHTML += `<p style="font-size:1.5rem;">该年份暂无资料，制作中，慢慢等</p>`;
  }
}

/****************************************************
 * 显示选中的题目内容
 ****************************************************/
function showQuestionDetail(question) {
  currentQuestion = question;
  document.getElementById("messages").innerHTML = "";
  const questionSec = document.getElementById("gaokao-question");
  questionSec.innerHTML = formatQuestionHTML(question);
  document.getElementById("gaokao-actions").style.display = "block";
  document.getElementById("dialogue-box").style.display = "block";
}

/****************************************************
 * 格式化题目内容
 ****************************************************/
function formatQuestionHTML(q) {
  let html = `<h2 style="font-size:1.5rem;">${q.year}年 ${q.topic || ""}</h2>`;
  if (q.material1) html += `<p><strong>材料1：</strong>${q.material1}</p>`;
  if (q.material2) html += `<p><strong>材料2：</strong>${q.material2}</p>`;
  for (let i = 1; i <= 5; i++) {
    if (q[`question${i}`]) {
      html += `<p><strong>问题${i}：</strong>${q[`question${i}`]}</p>`;
    }
  }
  if (q.prompts) {
    q.prompts.forEach((p, idx) => {
      html += `<p><strong>作文提示${idx + 1}：</strong>${p.prompt_text}</p>`;
    });
  }
  return html;
}

/****************************************************
 * 生成 AI prompt，针对不同题型
 ****************************************************/
function buildAIPrompt(q, mode, userAnswer = "") {
  let base = `${GAOKAO_PROMPTS[q.key] || GAOKAO_PROMPTS.default}\n题目信息：\n`;
  if (q.material1) base += `材料1：${q.material1}\n`;
  if (q.material2) base += `材料2：${q.material2}\n`;
  for (let i = 1; i <= 5; i++) {
    if (q[`question${i}`]) {
      base += `问题${i}：${q[`question${i}`]}\n`;
    }
  }
  
  // 针对微写作和大作文，追加专用评分指令
  if (q.key === "weixiezuo") {
    base += `\n${MICRO_WRITING_INSTRUCTIONS}\n`;
  } else if (q.key === "dazuowen") {
    base += `\n${LONG_ESSAY_INSTRUCTIONS}\n`;
  }
  
  if (mode === "review") {
    base += `\n用户答案：${userAnswer}\n参考答案：${q.reference_answer}\n请评价并给出建议。\n`;
  } else {
    base += `\n用户答案：${userAnswer}\n请直接完成作答。\n`;
  }
  return base;
}

/****************************************************
 * 呼叫 AI 并处理回复
 ****************************************************/
function callAI(prompt) {
  addMessage("<em>AI 正在思考...</em>", "system");
  fetch(CLOUD_FLARE_WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  })
    .then(res => res.json())
    .then(json => addMessage(`AI：${formatAnswer(json.answer)}`, "system"))
    .catch(err => {
      console.error("AI 请求失败", err);
      addMessage("制作中，慢慢等", "system");
    });
}

/****************************************************
 * 参考答案显示
 ****************************************************/
function showReferenceAnswer() {
  if (!currentQuestion) {
    alert("尚未选择任何题目");
    return;
  }
  if (currentQuestion.reference_answer) {
    addMessage("<strong>参考答案：</strong><br/>" + currentQuestion.reference_answer, "system");
  } else {
    addMessage("参考答案尚未录入，请稍后！", "system");
  }
}

/****************************************************
 * 用户提交答案后调用 AI 审阅（review 模式）
 ****************************************************/
function submitAnswer() {
  if (!currentQuestion) {
    alert("尚未选择任何题目");
    return;
  }
  const answer = document.getElementById("userAnswer").value.trim();
  if (!answer) {
    alert("请先输入答案");
    return;
  }
  
  // 显示对话框和用户答案
  document.getElementById("dialogue-box").style.display = "block";
  addMessage(`用户答案：${answer}`, "user");
  
  // 根据题型生成专门的 AI Prompt 进行审阅
  const prompt = buildAIPrompt(currentQuestion, "review", answer);
  callAI(prompt);
}

/****************************************************
 * AI 生成答案（solve 模式），启动对话
 ****************************************************/
function askAIForSolution() {
  if (!currentQuestion) {
    alert("尚未选择任何题目");
    return;
  }
  const prompt = buildAIPrompt(currentQuestion, "solve");
  callAI(prompt);
  document.getElementById("dialogue-box").style.display = "block";
}

/****************************************************
 * 夜晚模式切换
 ****************************************************/
function toggleDarkMode() {
  document.body.classList.toggle("dark-mode");
}