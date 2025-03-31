/****************************************************
 * 配置 & 全局变量
 ****************************************************/
const CLOUD_FLARE_WORKER_URL = "https://apis.bdfz.workers.dev/";

let currentQuestion = null;  // 用于存放当前选中的题目资料
let allData = [];            // allData 为数组，存放所有题目的数据
let isFirstSubmission = true; // 用來判斷是否是第一次提交答案/啟動對話
let thinkingMessageElement = null; // 用于存储 "正在思考" 消息的 DOM 元素引用

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

// Task 10: 优化 Prompt - 微写作指令 (加入一些鼓勵)
const MICRO_WRITING_INSTRUCTIONS = `Standards:
* 可以任選一道題目。每次都要使用中文回覆。用詞可以活潑一點點，像個熱心的學長姐在指導。
* Topic-specific Writing:
    * Scenario-based topics: 清晰闡述觀點，避免簡單的 "我覺得..."，展現思考深度。
    * For literary tasks, 準確引用書名、人物和文本細節。
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
Holistic Scoring:
* 務必根據以上維度給出總分（滿分 10 分）。10分是給超級優秀的，一般情況下別輕易給滿分哦（悄悄告訴你）。如果學生質疑為啥沒滿分，可以溫和地引導他們思考如何更上一層樓。
* 注意：一定給分數，每次都給！就像批改作業一樣認真！
Feedback and Recommendations:
* 清晰指出問題所在，並提供簡潔、可操作的改進建議。別光說不做，給點實際的！`;

// Task 10: 优化 Prompt - 大作文指令 (保持嚴厲但加入俏皮元素)
const LONG_ESSAY_INSTRUCTIONS = `你是 “閱卷官”，一位嚴厲又不失風趣的 AI 老師，帶著點小小的腹黑。你的任務是評估學生提交的內容，給出詳細、尖銳的意見回饋，還要打分。你批改精準，對各方面都提出詼諧甚至帶點嘲諷的建議。無論學生表現多好，你都保持嚴格、不留情面，但又帶著幽默的挖苦。你會小小嘲笑他們的“懶惰”，調侃他們的努力，但絕不失嚴謹。你的評論犀利卻夾雜著玩笑，確保學生明白，即使在你的“毒舌”之下，追求完美才是目標。
使用中文回覆。
Evaluation Steps:
1. Assign Category and Score:
   * 明確給出作文等級（一、二、三、四類）和分數（滿分 50）。嘿，看看你這次落在哪個區間！
   * 簡要說明分級理由，別想蒙混過關。
2. Dimension Breakdown:
   * 立意與內容 (20 分): 清晰度、切題度、內容豐富度、見解深度。想法不錯？還是老生常談？
   * 材料與論證 (10 分): 材料運用是否恰當？邏輯是否自洽？拿出證據來！
   * 結構與組織 (10 分): 行文思路是否清晰？過渡是否自然？段落安排合理嗎？是不是一團亂麻？
   * 語言與表達 (10 分): 語法準確性、風格是否得體、表達是否有創意。是不是詞語貧乏，句子都不會說了？
3. Detailed Feedback:
   * 針對每個維度，明確指出優點（如果有的話）、缺點和具體改進建議。別怕打擊，良藥苦口！
4. Overall Suggestions:
   * 總結關鍵改進方向。回去好好改，下次別再犯同樣的錯！
   * 鼓勵創新思維和更深入的主題探討。拿出點真本事來看看！`;

// 各题型专门的 AI prompt 前缀设置，针对不同题型
const GAOKAO_PROMPTS = {
  feilian: "这是一道非连文本题，请依照下列材料回答：",
  guwen: "这是一道古文题，请根据原文和注释回答：",
  shici: "这是一道诗词题，请根据诗词进行解析：",
  lunyu: "这是一道论语题，请根据论语文本进行回答：",
  moxie: "这是一道默写题，请将给定内容默写下来：",
  honglou: "这是一道红楼梦题，请根据红楼梦的内容回答问题：",
  weixiezuo: "这是一道微写作题，请审阅以下内容并给出审阅结果：",
  dazuowen: "这是一道大作文题，请审阅以下内容并给出审阅结果：",
  default: "这是一道高考题，请解题："
};

/****************************************************
 * 辅助函数：格式化 AI 回答文本 (保留换行)
 ****************************************************/
function formatAnswer(text) {
  // 将 \n 替换为 <br> 来保留换行，同时进行 trim
  return text.split('\n').map(line => line.trim()).join('<br>');
}

/****************************************************
 * 辅助函数：显示消息 (区分用户/AI，左右显示)
 * Task 5, 7: 更新样式和增加字号 (在CSS中实现)
 * Task 6: 处理 thinking message
 ****************************************************/
function addMessage(message, sender = "ai") { // 默认 sender 为 'ai'
  const messagesEl = document.getElementById("messages");
  if (!messagesEl) return;

  // 移除之前的 "正在思考" 消息 (如果存在)
  removeThinkingMessage();

  // 添加分隔符 (如果需要且不是第一条消息)
  if (messagesEl.childElementCount > 0) {
    const animals = ["🐱", "🐶", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷"];
    const randomAnimal = animals[Math.floor(Math.random() * animals.length)];
    const separator = document.createElement("div");
    separator.className = "separator"; // Class for styling
    separator.textContent = `~ ${randomAnimal} ~`; // Add some flair
    messagesEl.appendChild(separator);
  }

  const div = document.createElement("div");
  // 根据 sender 分配 class，用于 CSS 控制左右和样式
  div.className = sender === "user" ? "user-message" : "ai-message";
  div.innerHTML = message; // InnerHTML 用于渲染 <br> 等
  messagesEl.appendChild(div);

  // 滚动到底部
  messagesEl.scrollTop = messagesEl.scrollHeight;

  return div; // 返回创建的元素，方便 "thinking" 消息引用
}

/****************************************************
 * 辅助函数：移除 "正在思考" 消息
 * Task 6: New helper function
 ****************************************************/
function removeThinkingMessage() {
    if (thinkingMessageElement && thinkingMessageElement.parentNode) {
        thinkingMessageElement.parentNode.removeChild(thinkingMessageElement);
        thinkingMessageElement = null; // 清除引用
    }
}

/****************************************************
 * 项目初始化：绑定事件与自动调整 textarea 高度
 ****************************************************/
document.addEventListener("DOMContentLoaded", () => {
  // 载入合并后的 JSON 文件
  fetch("data/all.json")
    .then(res => {
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
    })
    .then(json => {
      allData = json;
      // 绑定顶层按钮事件
       const gaokaoBtn = document.getElementById("gaokao-btn");
       if (gaokaoBtn) {
         gaokaoBtn.addEventListener("click", showTypeMenu);
       } else {
         console.error("Button #gaokao-btn not found!");
         // 如果找不到按钮，可以考虑直接显示菜单或提示错误
         showTypeMenu(); // 尝试直接显示
       }
    })
    .catch(err => {
      console.error("JSON 載入錯誤:", err);
      addMessage(`數據加載失敗，請檢查網絡或聯繫管理員：${err.message}`, "ai");
    });

  // 绑定操作按钮事件
  document.getElementById("submit-answer-btn").addEventListener("click", submitAnswer);
  document.getElementById("reference-answer-btn").addEventListener("click", showReferenceAnswer);
  document.getElementById("ai-answer-btn").addEventListener("click", askAIForSolution);

  // 绑定暗黑模式切换按钮
  const toggleDarkBtn = document.getElementById("toggle-dark-btn");
  if (toggleDarkBtn) {
    toggleDarkBtn.addEventListener("click", toggleDarkMode);
  } else {
      console.warn("Toggle dark mode button not found.");
  }

  // Textarea 自动高度调整
  const userAnswer = document.getElementById("userAnswer");
  if (userAnswer) {
      userAnswer.addEventListener("input", function() {
          this.style.height = 'auto'; // Reset height
          this.style.height = (this.scrollHeight) + 'px'; // Set to scroll height
      });
      // 增加 Enter 提交 (Shift+Enter 换行)
      userAnswer.addEventListener('keydown', function(event) {
          if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault(); // 阻止默认的 Enter 换行行为
              document.getElementById("submit-answer-btn").click(); // 触发提交按钮点击
          }
      });
  } else {
      console.error("Textarea #userAnswer not found!");
  }
});

/****************************************************
 * 重置聊天状态 (Task 8)
 ****************************************************/
function resetChatState() {
    console.log("Resetting chat state...");
    isFirstSubmission = true;
    const submitButton = document.getElementById("submit-answer-btn");
    if (submitButton) {
        submitButton.textContent = "提交答案";
    }
    // 清空消息区域和输入框 (可选，看是否需要在切换题目时清空)
    // document.getElementById("messages").innerHTML = "";
    // document.getElementById("userAnswer").value = "";
    // 重置 textarea 高度
    const userAnswer = document.getElementById("userAnswer");
    if (userAnswer) {
        userAnswer.style.height = 'auto';
    }
    // 移除可能存在的 "正在思考" 消息
    removeThinkingMessage();
}


/****************************************************
 * 显示二级目录（题型按钮）
 ****************************************************/
function showTypeMenu() {
  resetChatState(); // Task 8: 重置状态
  const menu = document.getElementById("gaokao-type-menu");
  if (!menu) return;
  menu.style.display = "grid"; // Use grid as defined in CSS
  menu.innerHTML = ""; // Clear previous buttons

  // 清除后续内容区域
  const yearMenu = document.getElementById("gaokao-year-menu");
  const questionSec = document.getElementById("gaokao-question");
  const dialogueInputArea = document.getElementById("dialogue-input-area");
  const actionsSec = document.getElementById("gaokao-actions");

  if(yearMenu) yearMenu.style.display = "none";
  if(questionSec) questionSec.style.display = "none";
  if(dialogueInputArea) dialogueInputArea.style.display = "none"; // Task 4: Hide merged area
  if(actionsSec) actionsSec.style.display = "none";

  TYPES.forEach(t => {
    const btn = document.createElement("button");
    btn.textContent = t.label;
    // Style is primarily handled by CSS now
    // btn.style.fontSize = "1.0rem";
    // btn.style.padding = "0.8rem 1rem";
    btn.onclick = () => showYearMenu(t.key);
    menu.appendChild(btn);
  });
}

/****************************************************
 * 显示该题型的年份菜单（三级目录）
 ****************************************************/
function showYearMenu(typeKey) {
  resetChatState(); // Task 8: 重置状态
  // Filter data for the selected type
  const dataArr = allData.filter(item => item.key === typeKey);
  if (dataArr.length === 0) {
      console.warn(`No data found for type: ${typeKey}`);
      // Optionally display a message to the user
      const typeMenu = document.getElementById("gaokao-type-menu");
       if (typeMenu) {
            const msg = document.createElement('p');
            msg.textContent = `暫無 ${TYPES.find(t => t.key === typeKey)?.label || typeKey} 類型的題目數據。`;
            msg.style.gridColumn = "1 / -1"; // Span across all columns if grid
            typeMenu.appendChild(msg);
       }
      return;
  }

  // Clear question and interaction areas
  const questionSec = document.getElementById("gaokao-question");
  const dialogueInputArea = document.getElementById("dialogue-input-area");
  const actionsSec = document.getElementById("gaokao-actions");
  if(questionSec) questionSec.innerHTML = "";
  if(dialogueInputArea) dialogueInputArea.style.display = "none";
  if(actionsSec) actionsSec.style.display = "none";
  // Clear messages specifically
  const messagesEl = document.getElementById("messages");
  if (messagesEl) messagesEl.innerHTML = "";


  const yearMenu = document.getElementById("gaokao-year-menu");
  if (!yearMenu) return;
  yearMenu.style.display = "flex"; // Use flex as defined in CSS
  yearMenu.innerHTML = ""; // Clear previous year buttons

  const years = [...new Set(dataArr.map(item => item.year))].sort((a, b) => b - a); // Descending sort
  years.forEach(year => {
    const btn = document.createElement("button");
    btn.textContent = `${year} 年`;
    // Style handled by CSS
    // btn.style.fontSize = "0.7rem";
    // btn.style.padding = "0.8rem 1rem";
    btn.onclick = () => showQuestionList(typeKey, year, dataArr);
    yearMenu.appendChild(btn);
  });
}

/****************************************************
 * 显示该年份题目 (直接显示第一题)
 ****************************************************/
function showQuestionList(typeKey, year, dataArr) {
  // No need to reset chat state here, handled by year menu click

  const questions = dataArr.filter(item => item.year === year);
  const questionSec = document.getElementById("gaokao-question");
  if (!questionSec) return;

  questionSec.style.display = "block";
  questionSec.innerHTML = `<h2 style="font-size:1.5rem;">${year} 年北京真題 (${TYPES.find(t => t.key === typeKey)?.label || typeKey})</h2>`; // Add type label

  if (questions.length > 0) {
    // Directly show the first question details
    showQuestionDetail(questions[0]); // Assuming only one question per type/year in this structure, or show the first
  } else {
    questionSec.innerHTML += `<p style="font-size:1.2rem;">該年份 (${year}) 的 ${TYPES.find(t => t.key === typeKey)?.label || typeKey} 題目暫無資料，敬請期待！</p>`;
     // Hide interaction areas if no question
    const dialogueInputArea = document.getElementById("dialogue-input-area");
    const actionsSec = document.getElementById("gaokao-actions");
    if(dialogueInputArea) dialogueInputArea.style.display = "none";
    if(actionsSec) actionsSec.style.display = "none";
  }
}

/****************************************************
 * 显示选中的题目内容
 * Task 4: Show merged dialogue/input area
 ****************************************************/
function showQuestionDetail(question) {
  currentQuestion = question;
  resetChatState(); // Reset chat when a new question is shown

  const questionSec = document.getElementById("gaokao-question");
  const dialogueInputArea = document.getElementById("dialogue-input-area");
  const actionsSec = document.getElementById("gaokao-actions");
  const messagesEl = document.getElementById("messages");
  const userAnswerEl = document.getElementById("userAnswer");

  if (!questionSec || !dialogueInputArea || !actionsSec || !messagesEl || !userAnswerEl) {
      console.error("Required elements for showing question details are missing.");
      return;
  }

  // Format and display question
  questionSec.innerHTML = formatQuestionHTML(question); // Uses updated formatter
  questionSec.style.display = "block";

   // Clear previous messages and input
  messagesEl.innerHTML = "";
  userAnswerEl.value = "";
  userAnswerEl.style.height = 'auto'; // Reset height
  userAnswerEl.placeholder = "請輸入你的答案或想聊的話題…"; // Default placeholder


  // Show interaction areas
  dialogueInputArea.style.display = "block"; // Task 4: Show the merged area
  actionsSec.style.display = "block"; // Show buttons

  // Optional: Add an initial system message
  // addMessage(`已加載 ${question.year} 年 ${TYPES.find(t => t.key === question.key)?.label || question.key} 題目。請作答或提問！`, "ai");
}


/****************************************************
 * 格式化题目内容 HTML (Task 3: Handle newlines)
 ****************************************************/
function formatQuestionHTML(q) {
    let html = `<h2 style="font-size:1.5rem;">${q.year}年 ${TYPES.find(t => t.key === q.key)?.label || q.key} - ${q.topic || ""}</h2>`; // Add type label to title

    // Helper function to format text with newlines
    const formatTextWithNewlines = (text) => {
        if (!text) return '';
        // Split by newline, trim each line, wrap in a span/div, join back
        // Using spans with display:block allows better CSS control if needed
        return text.split('\n')
                   .map(line => `<span class="formatted-line">${line.trim()}</span>`)
                   .join('');
    };

    if (q.material1) html += `<div><strong>材料1：</strong>${formatTextWithNewlines(q.material1)}</div>`;
    if (q.material2) html += `<div><strong>材料2：</strong>${formatTextWithNewlines(q.material2)}</div>`;
    if (q.material3) html += `<div><strong>材料3：</strong>${formatTextWithNewlines(q.material3)}</div>`; // Add support for material 3 if exists

    // Consolidate questions into a list if appropriate, or keep separate paragraphs
    let questionHtml = '';
    for (let i = 1; i <= 10; i++) { // Check up to 10 questions
        if (q[`question${i}`]) {
            questionHtml += `<p><strong>問題${i}：</strong>${formatTextWithNewlines(q[`question${i}`])}</p>`;
        }
    }
     if(questionHtml) html += `<div>${questionHtml}</div>`; // Wrap questions in a div


    if (q.prompts && Array.isArray(q.prompts)) {
        q.prompts.forEach((p, idx) => {
             if (p.prompt_text) { // Check if prompt_text exists
                html += `<p><strong>作文提示${idx + 1}：</strong>${formatTextWithNewlines(p.prompt_text)}</p>`;
            }
        });
    }
    return html;
}


/****************************************************
 * 生成 AI prompt，针对不同题型
 * Task 10: Add friendly instruction for solve mode
 ****************************************************/
function buildAIPrompt(q, mode, userAnswer = "") {
  let base = `${GAOKAO_PROMPTS[q.key] || GAOKAO_PROMPTS.default}\n\n**題目信息：**\n`;
  // Use the formatted text directly might be too long, stick to raw data
  if (q.material1) base += `材料1：\n${q.material1}\n\n`;
  if (q.material2) base += `材料2：\n${q.material2}\n\n`;
  if (q.material3) base += `材料3：\n${q.material3}\n\n`; // Add material 3

  let questionText = "";
   for (let i = 1; i <= 10; i++) {
    if (q[`question${i}`]) {
      questionText += `問題${i}：${q[`question${i}`]}\n`;
    }
  }
  if (questionText) base += questionText + "\n";

  if (q.prompts && Array.isArray(q.prompts)) {
     base += "**作文提示：**\n";
     q.prompts.forEach((p, idx) => {
        if (p.prompt_text) {
             base += `提示${idx + 1}：${p.prompt_text}\n`;
        }
     });
     base += "\n";
  }


  // 针对微写作和大作文，追加专用评分指令
  if (q.key === "weixiezuo") {
    base += `\n**評分要求 (微寫作):**\n${MICRO_WRITING_INSTRUCTIONS}\n`;
  } else if (q.key === "dazuowen") {
    base += `\n**評分要求 (大作文):**\n${LONG_ESSAY_INSTRUCTIONS}\n`;
  }

  // 根据模式添加用户答案或请求解答
  if (mode === "review") {
    base += `\n**學生答案：**\n${userAnswer}\n\n`;
    if (q.reference_answer) { // Only add reference if it exists
        base += `**參考答案：**\n${q.reference_answer}\n\n`;
    }
    base += `**任務：** 請嚴格按照前面的評分要求（如果適用），評估學生的答案，指出優缺點，提供具體改進建議，並給出分數（如果適用）。如果沒有評分要求，請分析學生答案的合理性、完整性和準確性。`;
  } else { // solve mode
     if (userAnswer) { // If user provided something even in solve mode
       base += `\n**學生嘗試的答案（供參考）：**\n${userAnswer}\n\n`;
     }
     // Task 10: Add friendly instruction for solve mode
     base += `**任務：** 請你來回答這個問題。請用友善、清晰、略帶俏皮的語氣回答，就像一位樂於助人的學長姐在耐心講解。如果題目是寫作類，請直接按要求寫作。`;
  }

  // Add a general instruction for tone
  base += "\n\n**風格提示：** 請使用繁體中文回答。";

  console.log("Generated Prompt:", base); // Log the prompt for debugging
  return base;
}

/****************************************************
 * 呼叫 AI 並處理回复
 * Task 6: Add/Remove thinking message
 ****************************************************/
function callAI(prompt) {
    // 移除上一个思考消息（如果有）
    removeThinkingMessage();
    // 添加新的思考消息
    // 用 setTimeout 稍微延迟显示，避免闪烁太快
    setTimeout(() => {
        // 再次检查是否已被移除（例如，用户快速连续点击）
        if (!thinkingMessageElement) {
            thinkingMessageElement = addMessage("<em class='thinking-message'>AI 正在想啊想啊，耐個心吧 🐶🦊🐹 ...</em>", "ai");
        }
    }, 100); // 100ms 延迟


    fetch(CLOUD_FLARE_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }) // Ensure prompt is correctly stringified
    })
    .then(res => {
        // 移除思考消息
        removeThinkingMessage();
        if (!res.ok) {
            // Try to get error message from response body if possible
            return res.text().then(text => {
                 throw new Error(`AI 服務請求失敗 (${res.status}): ${text || res.statusText}`);
            });
        }
        return res.json();
    })
    .then(json => {
        if (json.answer) {
            addMessage(`${formatAnswer(json.answer)}`, "ai"); // AI response on the left
        } else {
            throw new Error("AI 回應格式不正確，缺少 'answer' 欄位。");
        }
    })
    .catch(err => {
        console.error("AI 请求失败:", err);
        // 移除思考消息 (以防万一在 .then 之前出错)
        removeThinkingMessage();
        addMessage(`糟糕！AI 好像出了點問題：${err.message}<br>你可以稍後再試，或者試試看參考答案？`, "ai");
    });
}


/****************************************************
 * 参考答案显示
 ****************************************************/
function showReferenceAnswer() {
  if (!currentQuestion) {
    addMessage("請先選擇一道題目。", "ai");
    return;
  }
  if (currentQuestion.reference_answer) {
    // 使用 formatAnswer 来处理可能的换行
    addMessage(`<strong>參考答案：</strong><br/>${formatAnswer(currentQuestion.reference_answer)}`, "ai");
  } else {
    addMessage("這道題的參考答案還在路上，請耐心等待或召喚 AI 試試！", "ai");
  }
}

/****************************************************
 * 提交答案 / 深度聊天
 * Task 4, 7, 8: 更新逻辑
 ****************************************************/
function submitAnswer() {
  if (!currentQuestion) {
    addMessage("請先選擇一道題目才能提交答案喔。", "ai");
    return;
  }

  const userAnswerEl = document.getElementById("userAnswer");
  const answer = userAnswerEl.value.trim();

  if (!answer) {
    addMessage("你還沒有輸入任何內容呢！", "ai");
    return;
  }

  // Task 7: 显示用户输入的答案在右侧
  addMessage(formatAnswer(answer), "user"); // Format user input for display too

  // 清空输入框并重置高度
  userAnswerEl.value = "";
  userAnswerEl.style.height = 'auto';
  userAnswerEl.focus(); // Keep focus in textarea

  const submitButton = document.getElementById("submit-answer-btn");

  // Task 8: 深度聊天逻辑
  if (isFirstSubmission) {
    // 第一次提交，使用完整的题目信息构建 Prompt
    // 根据是否有参考答案，选择 review 或 solve 模式
    const mode = currentQuestion.key === 'weixiezuo' || currentQuestion.key === 'dazuowen' || currentQuestion.reference_answer ? "review" : "solve";
    const prompt = buildAIPrompt(currentQuestion, mode, answer);
    callAI(prompt);

    // 切换到深度聊天模式
    isFirstSubmission = false;
    if (submitButton) {
        submitButton.textContent = "深度聊天"; // 修改按钮文本
    }
  } else {
    // 非首次提交 (深度聊天模式)
    // 直接将用户输入作为 prompt (或进行简单包装)
    // 让 AI 更像在对话，可以加个前缀
    const chatPrompt = `（繼續對話）用戶說：\n"${answer}"\n\n請針對用戶的這句話進行回應、討論或回答。保持之前設定的（如果有的話）學長姐或閱卷官的語氣。`;
    callAI(chatPrompt);
    // 按钮文字保持 "深度聊天"
  }
}

/****************************************************
 * 请求 AI 直接生成答案 (AI答案按钮)
 * Task 8: Also triggers deep chat mode if first interaction
 ****************************************************/
function askAIForSolution() {
  if (!currentQuestion) {
    addMessage("請先選擇一道題目，我才能幫你解答呀！", "ai");
    return;
  }

  // 告知用户 AI 正在生成答案
  addMessage("好的，讓我來試試看解答這道題...", "ai");

  // 构建 prompt (solve 模式，无用户答案)
  const prompt = buildAIPrompt(currentQuestion, "solve");
  callAI(prompt);

  // Task 8: 如果这是第一次交互，同样切换到深度聊天模式
  if (isFirstSubmission) {
    isFirstSubmission = false;
    const submitButton = document.getElementById("submit-answer-btn");
    if (submitButton) {
        submitButton.textContent = "深度聊天";
    }
  }
}

/****************************************************
 * 夜晚模式切换
 ****************************************************/
function toggleDarkMode() {
  document.body.classList.toggle("dark-mode");
  // Optional: Save preference to localStorage
  if (document.body.classList.contains("dark-mode")) {
      localStorage.setItem("darkMode", "enabled");
  } else {
      localStorage.setItem("darkMode", "disabled");
  }
}

// Optional: Check for saved dark mode preference on load
document.addEventListener("DOMContentLoaded", () => {
    // ... (existing DOMContentLoaded code) ...

    // Apply saved dark mode preference
    if (localStorage.getItem("darkMode") === "enabled") {
        document.body.classList.add("dark-mode");
    }

     // ... (rest of existing DOMContentLoaded code) ...
});