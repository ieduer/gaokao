/****************************************************
 * 配置 & 全局变量
 ****************************************************/
const CLOUD_FLARE_WORKER_URL = "https://apis.bdfz.workers.dev/";

let currentQuestion = null;
let allData = [];
let isFirstSubmission = true;
let thinkingMessageElement = null;

const TYPES = [
  { key: "feilian", label: "非连文本" }, { key: "guwen", label: "古文" },
  { key: "shici", label: "诗词" }, { key: "lunyu", label: "论语" },
  { key: "moxie", label: "默写" }, { key: "honglou", label: "红楼梦" },
  { key: "sanwen", label: "散文" }, { key: "yuyanjichu", label: "语言基础运用" },
  { key: "weixiezuo", label: "微写作" }, { key: "dazuowen", label: "大作文" }
];

// --- Prompts (保持不變) ---
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
}; // Corrected Potential Syntax Error (Ensured it's a standard object literal)

/****************************************************
 * 辅助函数：格式化 AI 回答文本
 ****************************************************/
function formatAnswer(text) {
  if (typeof text !== 'string') {
    console.warn("formatAnswer received non-string input:", text);
    return "";
  }
  // Replace multiple newlines with a single <br> for better spacing control via CSS if needed
  // Or keep simple \n to <br>
  return text.split('\n').map(line => line.trim()).join('<br>');
}

/****************************************************
 * 辅助函数：显示消息 (无分隔符)
 ****************************************************/
function addMessage(message, sender = "ai") {
  const messagesEl = document.getElementById("messages");
  if (!messagesEl) return null; // Return null if container not found

  removeThinkingMessage();

  const div = document.createElement("div");
  div.className = sender === "user" ? "user-message" : "ai-message";
  div.innerHTML = message; // Use innerHTML carefully
  messagesEl.appendChild(div);

  // Scroll to bottom
  messagesEl.scrollTop = messagesEl.scrollHeight;

  return div; // Return the created element
}

/****************************************************
 * 辅助函数：移除 "正在思考" 消息
 ****************************************************/
function removeThinkingMessage() {
    if (thinkingMessageElement && thinkingMessageElement.parentNode) {
        try {
            thinkingMessageElement.parentNode.removeChild(thinkingMessageElement);
        } catch (e) { /* Ignore */ }
        finally { thinkingMessageElement = null; }
    }
}

/****************************************************
 * 项目初始化
 ****************************************************/
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded");

  fetch("data/all.json")
    .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
    })
    .then(json => {
      console.log("JSON data loaded.");
      allData = json; // Assign data

      const gaokaoBtn = document.getElementById("gaokao-btn");
      if (gaokaoBtn) {
          console.log("Found #gaokao-btn, attaching listener.");
          gaokaoBtn.addEventListener("click", () => {
              console.log("#gaokao-btn clicked!"); // Log click
              showTypeMenu(); // Call the function to display the menu
          });
      } else {
          console.error("#gaokao-btn not found!");
      }
    })
    .catch(err => {
      console.error("JSON load error:", err);
      // Display error message to user
      const mainEl = document.querySelector('main');
      const errorMsg = document.createElement('p');
      errorMsg.textContent = `Error loading data: ${err.message}. Please refresh or contact support.`;
      errorMsg.style.color = 'red';
      errorMsg.style.textAlign = 'center';
      errorMsg.style.padding = '1rem';
      if (mainEl) {
          mainEl.prepend(errorMsg);
      } else {
          document.body.prepend(errorMsg);
      }
      // Disable Gaokao button if data fails to load
      const gaokaoBtn = document.getElementById("gaokao-btn");
      if (gaokaoBtn) gaokaoBtn.disabled = true;
    });

  // Attach other listeners
  document.getElementById("submit-answer-btn")?.addEventListener("click", submitAnswer);
  document.getElementById("reference-answer-btn")?.addEventListener("click", showReferenceAnswer);
  document.getElementById("ai-answer-btn")?.addEventListener("click", askAIForSolution);
  document.getElementById("toggle-dark-btn")?.addEventListener("click", toggleDarkMode);

  // Textarea setup
  const userAnswer = document.getElementById("userAnswer");
  if (userAnswer) {
      userAnswer.addEventListener("input", function() {
          this.style.height = 'auto';
          this.style.height = (this.scrollHeight) + 'px';
      });
      userAnswer.addEventListener('keydown', function(event) {
          if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              document.getElementById("submit-answer-btn")?.click();
          }
      });
  }

  // Apply saved dark mode
  if (localStorage.getItem("darkMode") === "enabled") {
      document.body.classList.add("dark-mode");
  }
}); // End of DOMContentLoaded

/****************************************************
 * 重置聊天状态
 ****************************************************/
function resetChatState() {
    isFirstSubmission = true;
    document.getElementById("submit-answer-btn")?.textContent = "提交答案";
    const messagesEl = document.getElementById("messages");
    if (messagesEl) messagesEl.innerHTML = "";
    const userAnswer = document.getElementById("userAnswer");
    if (userAnswer) {
        userAnswer.value = "";
        userAnswer.style.height = 'auto';
        userAnswer.placeholder = "請輸入你的答案或想聊的話題…";
    }
    removeThinkingMessage();
}


/****************************************************
 * 显示二级目录（题型按钮）
 ****************************************************/
function showTypeMenu() {
  console.log("Executing showTypeMenu..."); // Log entry
  const menu = document.getElementById("gaokao-type-menu");
  if (!menu) {
      console.error("#gaokao-type-menu not found!");
      return;
  }

  menu.innerHTML = ""; // Clear previous content

  // Hide other sections
  document.getElementById("gaokao-year-menu")?.style.display = "none";
  document.getElementById("gaokao-question")?.style.display = "none";
  document.getElementById("dialogue-input-area")?.style.display = "none";
  document.getElementById("gaokao-actions")?.style.display = "none";

  resetChatState(); // Reset chat when showing types

  if (!Array.isArray(TYPES) || TYPES.length === 0) {
       console.error("TYPES data is invalid.");
       menu.innerHTML = "<p>無法加載題型數據。</p>";
       menu.style.display = "block"; // Show error
       return;
   }

  console.log(`Creating ${TYPES.length} type buttons.`); // Log count
  TYPES.forEach(t => {
    const btn = document.createElement("button");
    btn.textContent = t.label;
    // Explicitly set styles to ensure visibility, CSS should take precedence if correct
    btn.style.visibility = 'visible';
    btn.style.opacity = '1';
    btn.style.color = '#333'; // Ensure text color contrast
    btn.style.backgroundColor = '#e6e6fa'; // Ensure background color contrast
    btn.onclick = () => showYearMenu(t.key);
    menu.appendChild(btn);
  });

  // Set display AFTER adding buttons
  menu.style.display = "flex";
  console.log("#gaokao-type-menu display style set to 'flex'.");
}

/****************************************************
 * 显示该题型的年份菜单
 ****************************************************/
function showYearMenu(typeKey) {
  console.log(`Showing year menu for type: ${typeKey}`);
  resetChatState();
  const dataArr = allData.filter(item => item.key === typeKey);
  const typeLabel = TYPES.find(t => t.key === typeKey)?.label || typeKey;
  const yearMenu = document.getElementById("gaokao-year-menu");
  if (!yearMenu) return;

  document.getElementById("gaokao-question")?.style.display = "none";
  document.getElementById("dialogue-input-area")?.style.display = "none";
  document.getElementById("gaokao-actions")?.style.display = "none";

  yearMenu.innerHTML = ""; // Clear previous

  if (dataArr.length === 0) {
    yearMenu.innerHTML = `<p style="text-align:center; width:100%; padding: 1rem;">暫無 ${typeLabel} 題目。</p>`;
  } else {
    const years = [...new Set(dataArr.map(item => item.year))].sort((a, b) => b - a);
    years.forEach(year => {
      const btn = document.createElement("button");
      btn.textContent = `${year} 年`;
      btn.onclick = () => showQuestionList(typeKey, year, dataArr);
      yearMenu.appendChild(btn);
    });
  }
  yearMenu.style.display = "flex"; // Show the menu (or message)
}

/****************************************************
 * 显示该年份题目列表 (实际显示第一题)
 ****************************************************/
function showQuestionList(typeKey, year, dataArr) {
  console.log(`Showing question list for type: ${typeKey}, year: ${year}`);
  resetChatState();
  const questions = dataArr.filter(item => item.year === year);
  const questionSec = document.getElementById("gaokao-question");
  const dialogueInputArea = document.getElementById("dialogue-input-area");
  const actionsSec = document.getElementById("gaokao-actions");
  const typeLabel = TYPES.find(t => t.key === typeKey)?.label || typeKey;

  if (!questionSec || !dialogueInputArea || !actionsSec) return;

  questionSec.innerHTML = `<h2 style="font-size:1.5rem;">${year} 年北京真題 (${typeLabel})</h2>`; // Set title

  if (questions.length > 0) {
    questionSec.style.display = "block"; // Show question section
    showQuestionDetail(questions[0]); // This will show dialogue/actions
  } else {
    questionSec.innerHTML += `<p style="font-size:1.2rem;">${year} 年 ${typeLabel} 題目暫無資料。</p>`;
    questionSec.style.display = "block"; // Show 'no data' message
    dialogueInputArea.style.display = "none"; // Hide interaction
    actionsSec.style.display = "none";
  }
}


/****************************************************
 * 显示选中的题目内容
 ****************************************************/
function showQuestionDetail(question) {
  console.log(`Showing details for question: ${question.year} ${question.key}`);
  currentQuestion = question;
  resetChatState(); // Reset when showing details

  const questionSec = document.getElementById("gaokao-question");
  const dialogueInputArea = document.getElementById("dialogue-input-area");
  const actionsSec = document.getElementById("gaokao-actions");

  if (!questionSec || !dialogueInputArea || !actionsSec) return;

  questionSec.innerHTML = formatQuestionHTML(question); // Format and display question
  questionSec.style.display = "block";

  // Dialogue and actions should be displayed
  dialogueInputArea.style.display = "block";
  actionsSec.style.display = "block";
}


/****************************************************
 * 格式化题目内容 HTML
 ****************************************************/
function formatQuestionHTML(q) {
    // Check if q is valid
    if (!q || typeof q !== 'object') {
        console.error("Invalid question data passed to formatQuestionHTML:", q);
        return "<p style='color:red;'>錯誤：無法顯示題目內容。</p>";
    }

    const typeLabel = TYPES.find(t => t.key === q.key)?.label || q.key || '未知題型';
    const yearLabel = q.year || '未知年份';
    const topicLabel = q.topic || ''; // Handle potentially missing topic

    let html = `<h2 style="font-size:1.5rem;">${yearLabel}年 ${typeLabel} ${topicLabel ? '- ' + topicLabel : ''}</h2>`;

    const formatTextWithNewlines = (text) => {
        if (!text || typeof text !== 'string') return ''; // Check type
        return text.split('\n')
                   .map(line => `<span class="formatted-line">${line.trim()}</span>`)
                   .join('');
    };

    // Safely access materials and questions
    if (q.material1) html += `<div><strong>材料1：</strong>${formatTextWithNewlines(q.material1)}</div>`;
    if (q.material2) html += `<div><strong>材料2：</strong>${formatTextWithNewlines(q.material2)}</div>`;
    if (q.material3) html += `<div><strong>材料3：</strong>${formatTextWithNewlines(q.material3)}</div>`;

    let questionHtml = '';
    for (let i = 1; i <= 10; i++) {
        const questionKey = `question${i}`;
        if (q[questionKey]) {
            questionHtml += `<p><strong>問題${i}：</strong>${formatTextWithNewlines(q[questionKey])}</p>`;
        }
    }
    if (questionHtml) html += `<div style="margin-top: 1em;">${questionHtml}</div>`;

    if (q.prompts && Array.isArray(q.prompts)) {
        let promptHtml = '';
        q.prompts.forEach((p, idx) => {
            // Check if p is an object and has prompt_text
            if (p && typeof p === 'object' && p.prompt_text) {
                promptHtml += `<p><strong>作文提示${idx + 1}：</strong>${formatTextWithNewlines(p.prompt_text)}</p>`;
            }
        });
        if (promptHtml) {
            html += `<div style="margin-top: 1em;">${promptHtml}</div>`;
        }
    }
    return html;
}


/****************************************************
 * 生成 AI prompt
 ****************************************************/
function buildAIPrompt(q, mode, userAnswer = "") {
    // Basic validation for q
    if (!q || typeof q !== 'object') {
        console.error("Invalid question object passed to buildAIPrompt:", q);
        return "錯誤：無法生成提示，題目數據無效。"; // Return an error prompt
    }

    const promptKey = q.key || 'default'; // Fallback key
    let base = `${GAOKAO_PROMPTS[promptKey] || GAOKAO_PROMPTS.default}\n\n**題目信息：**\n`;

    // Safely append materials
    if (q.material1) base += `材料1：\n${q.material1}\n\n`;
    if (q.material2) base += `材料2：\n${q.material2}\n\n`;
    if (q.material3) base += `材料3：\n${q.material3}\n\n`;

    let questionText = "";
    for (let i = 1; i <= 10; i++) {
        if (q[`question${i}`]) questionText += `問題${i}：${q[`question${i}`]}\n`;
    }
    if (questionText) base += questionText + "\n";

    if (q.prompts && Array.isArray(q.prompts)) {
        let promptText = "";
        q.prompts.forEach((p, idx) => {
            if (p && typeof p === 'object' && p.prompt_text) { // Add validation
                promptText += `提示${idx + 1}：${p.prompt_text}\n`;
            }
        });
        if (promptText) {
             base += "**作文提示：**\n" + promptText + "\n";
        }
    }

    // Add specific instructions based on key
    if (q.key === "weixiezuo") base += `\n**評分要求 (微寫作):**\n${MICRO_WRITING_INSTRUCTIONS}\n`;
    else if (q.key === "dazuowen") base += `\n**評分要求 (大作文):**\n${LONG_ESSAY_INSTRUCTIONS}\n`;

    // Add user answer / task based on mode
    if (mode === "review") {
        base += `\n**學生答案：**\n${userAnswer || "(未提供)"}\n\n`; // Handle empty user answer
        if (q.reference_answer) base += `**參考答案：**\n${q.reference_answer}\n\n`;
        base += `**任務：** 請嚴格按照前面的評分要求（如果適用），評估學生的答案，指出優缺點，提供具體改進建議，並給出分數（如果適用）。如果沒有評分要求，請分析學生答案的合理性、完整性和準確性。`;
    } else { // solve mode
        if (userAnswer) base += `\n**學生嘗試的答案（供參考）：**\n${userAnswer}\n\n`;
        base += `**任務：** 請你來回答這個問題。請用友善、清晰、略帶俏皮的語氣回答，就像一位樂於助人的學長姐在耐心講解。如果題目是寫作類，請直接按要求寫作。`;
    }
    base += "\n\n**風格提示：** 請使用繁體中文回答。";
    // console.log("Generated Prompt:", base); // Keep for debugging if needed
    return base;
}


/****************************************************
 * 呼叫 AI 並處理回复
 ****************************************************/
function callAI(prompt) {
    if (typeof prompt !== 'string' || !prompt.trim()) {
        console.error("Invalid prompt passed to callAI:", prompt);
        addMessage("內部錯誤：無法生成有效的 AI 請求。", "ai");
        return;
    }

    removeThinkingMessage();
    const timeoutId = setTimeout(() => {
        if (!thinkingMessageElement) {
             thinkingMessageElement = addMessage("<em class='thinking-message'>AI 正在想啊想啊，耐個心吧 🐶🦊🐹 ...</em>", "ai");
        }
    }, 150);

    fetch(CLOUD_FLARE_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt }) // Ensure correct format
    })
    .then(res => {
        clearTimeout(timeoutId);
        removeThinkingMessage();
        if (!res.ok) {
            // Attempt to parse error from JSON body first
            return res.json().catch(() => null).then(errorBody => {
                const errorMsg = errorBody?.error || errorBody?.message || `HTTP ${res.status}`;
                throw new Error(`AI 服務請求失敗: ${errorMsg}`);
            });
        }
        return res.json();
    })
    .then(json => {
        if (json && json.answer) { // Check if json and json.answer exist
            addMessage(`${formatAnswer(json.answer)}`, "ai");
        } else {
             // Log the problematic response for debugging
             console.error("AI response missing 'answer' field:", json);
             throw new Error("AI 回應格式不正確或為空。");
        }
    })
    .catch(err => {
        console.error("AI request/processing failed:", err);
        clearTimeout(timeoutId); // Ensure clear on error
        removeThinkingMessage();
        addMessage(`糟糕！與 AI 連接時發生錯誤：<br><small>${err.message || "未知錯誤"}</small>`, "ai");
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
    addMessage(`<strong>參考答案：</strong><br/>${formatAnswer(currentQuestion.reference_answer)}`, "ai");
  } else {
    addMessage("這道題的參考答案尚未錄入。", "ai");
  }
}

/****************************************************
 * 提交答案 / 深度聊天
 ****************************************************/
function submitAnswer() {
  if (!currentQuestion) {
    addMessage("請先選擇一道題目才能提交答案喔。", "ai");
    return;
  }
  const userAnswerEl = document.getElementById("userAnswer");
  if (!userAnswerEl) return;

  const answer = userAnswerEl.value.trim();

  if (!answer) {
    addMessage("你還沒有輸入任何內容呢！", "ai");
    userAnswerEl.style.outline = '2px solid red'; // Use outline for temp highlight
    setTimeout(() => { userAnswerEl.style.outline = ''; }, 600);
    return;
  }

  addMessage(formatAnswer(answer), "user");

  userAnswerEl.value = "";
  userAnswerEl.style.height = 'auto';
  userAnswerEl.focus();

  const submitButton = document.getElementById("submit-answer-btn");

  if (isFirstSubmission) {
    // Determine mode: review for writing tasks or if ref answer exists, else solve
    const mode = (currentQuestion.key === 'weixiezuo' || currentQuestion.key === 'dazuowen' || currentQuestion.reference_answer) ? "review" : "solve";
    const prompt = buildAIPrompt(currentQuestion, mode, answer);
    callAI(prompt);
    isFirstSubmission = false; // Set state AFTER successful call setup
    if (submitButton) submitButton.textContent = "深度聊天";
  } else {
    // Deep chat mode
    const chatPrompt = `（繼續對話）用戶說：\n"${answer}"\n\n請針對用戶的這句話進行回應、討論或回答。保持之前設定的（如果有的話）學長姐或閱卷官的語氣。`;
    callAI(chatPrompt);
  }
}

/****************************************************
 * 请求 AI 直接生成答案
 ****************************************************/
function askAIForSolution() {
  if (!currentQuestion) {
    addMessage("請先選擇一道題目，我才能幫你解答呀！", "ai");
    return;
  }

  addMessage("好的，讓我來試試看解答這道題...", "ai"); // User feedback

  const prompt = buildAIPrompt(currentQuestion, "solve"); // Solve mode, no user answer
  callAI(prompt);

  // If this is the first interaction, switch to deep chat mode
  if (isFirstSubmission) {
    isFirstSubmission = false;
    const submitButton = document.getElementById("submit-answer-btn");
    if (submitButton) submitButton.textContent = "深度聊天";
  }
}

/****************************************************
 * 夜晚模式切换
 ****************************************************/
function toggleDarkMode() {
  document.body.classList.toggle("dark-mode");
  if (document.body.classList.contains("dark-mode")) {
      localStorage.setItem("darkMode", "enabled");
  } else {
      localStorage.setItem("darkMode", "disabled");
  }
}

// --- End of app.js ---