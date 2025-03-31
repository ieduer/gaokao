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
const GAOKAO_PROMPTS = { /* ... (保持不變) ... */ };

/****************************************************
 * 辅助函数：格式化 AI 回答文本
 ****************************************************/
function formatAnswer(text) {
  // Basic check for non-string input which might happen from API errors
  if (typeof text !== 'string') {
      console.warn("formatAnswer received non-string input:", text);
      return ""; // Return empty string or some placeholder
  }
  return text.split('\n').map(line => line.trim()).join('<br>');
}


/****************************************************
 * 辅助函数：显示消息 (无分隔符)
 ****************************************************/
function addMessage(message, sender = "ai") {
  const messagesEl = document.getElementById("messages");
  if (!messagesEl) return;

  removeThinkingMessage();

  const div = document.createElement("div");
  div.className = sender === "user" ? "user-message" : "ai-message";
  // Use innerHTML carefully, assuming formatAnswer sanitizes reasonably well
  div.innerHTML = message;
  messagesEl.appendChild(div);

  messagesEl.scrollTop = messagesEl.scrollHeight;

  return div;
}

/****************************************************
 * 辅助函数：移除 "正在思考" 消息
 ****************************************************/
function removeThinkingMessage() {
    if (thinkingMessageElement && thinkingMessageElement.parentNode) {
        try {
            thinkingMessageElement.parentNode.removeChild(thinkingMessageElement);
        } catch (e) { /* Ignore potential errors */ }
        finally { thinkingMessageElement = null; }
    }
}

/****************************************************
 * 项目初始化
 * Task 2 Debug: Ensure listener is attached correctly
 ****************************************************/
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded and parsed"); // Debugging

  fetch("data/all.json")
    .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
    })
    .then(json => {
      console.log("JSON data loaded successfully."); // Debugging
      allData = json;

      // Task 1 & 2: Event listener is now on the button inside the header
      const gaokaoBtn = document.getElementById("gaokao-btn");
      if (gaokaoBtn) {
          console.log("Found #gaokao-btn, adding click listener."); // Debugging
          gaokaoBtn.addEventListener("click", () => {
              console.log("#gaokao-btn clicked, calling showTypeMenu..."); // Debugging
              showTypeMenu();
          });
      } else {
          console.error("#gaokao-btn not found in the header!");
      }
    })
    .catch(err => {
      console.error("JSON 載入錯誤:", err);
      const bodyMsg = document.createElement('p');
      bodyMsg.textContent = `數據加載失敗: ${err.message}`;
      bodyMsg.style.color = 'red';
      bodyMsg.style.textAlign = 'center';
      bodyMsg.style.padding = '1rem';
      document.main?.prepend(bodyMsg) || document.body.prepend(bodyMsg); // Try to add to main or body
    });

  // Attach other listeners safely using optional chaining
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
  } else {
      console.error("#userAnswer textarea not found!");
  }

  // Apply saved dark mode preference
  if (localStorage.getItem("darkMode") === "enabled") {
      document.body.classList.add("dark-mode");
  }
});

/****************************************************
 * 重置聊天状态
 ****************************************************/
function resetChatState() {
    // console.log("Resetting chat state...");
    isFirstSubmission = true;
    document.getElementById("submit-answer-btn")?.textContent = "提交答案"; // Use optional chaining
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
 * Task 2 Debug: Ensure display style is set correctly
 ****************************************************/
function showTypeMenu() {
  console.log("Inside showTypeMenu function."); // Debugging
  const menu = document.getElementById("gaokao-type-menu");
  if (!menu) {
      console.error("#gaokao-type-menu element not found!");
      return;
  }

  menu.innerHTML = ""; // Clear previous buttons first

  // Hide subsequent sections
  document.getElementById("gaokao-year-menu")?.style.display = "none";
  document.getElementById("gaokao-question")?.style.display = "none";
  document.getElementById("dialogue-input-area")?.style.display = "none";
  document.getElementById("gaokao-actions")?.style.display = "none";

  // Reset chat state when showing the type menu
  resetChatState();

  // Check if TYPES array is valid
   if (!Array.isArray(TYPES) || TYPES.length === 0) {
       console.error("TYPES array is invalid or empty.");
       menu.innerHTML = "<p>題型數據加載失敗。</p>";
       menu.style.display = "block"; // Show error message
       return;
   }

  console.log(`Populating type menu with ${TYPES.length} types.`); // Debugging
  TYPES.forEach((t, index) => {
    const btn = document.createElement("button");
    btn.textContent = t.label;
    // Basic styles added via JS for debugging visibility, CSS should override
    btn.style.visibility = 'visible';
    btn.style.opacity = '1';
    btn.style.border = '1px solid grey'; // Make sure border exists
    btn.style.padding = '0.6rem 1rem'; // Ensure it has dimensions
    btn.onclick = () => showYearMenu(t.key);
    menu.appendChild(btn);
    // console.log(`Appended button: ${t.label}`); // Debugging log per button
  });

  // CRITICAL: Set display to flex AFTER populating
  menu.style.display = "flex";
  console.log("#gaokao-type-menu display set to 'flex'. Check browser inspector."); // Debugging
}

/****************************************************
 * 显示该题型的年份菜单
 ****************************************************/
function showYearMenu(typeKey) {
  resetChatState();
  const dataArr = allData.filter(item => item.key === typeKey);
  const typeLabel = TYPES.find(t => t.key === typeKey)?.label || typeKey;
  const yearMenu = document.getElementById("gaokao-year-menu");
  if (!yearMenu) return;

  // Hide other sections
  document.getElementById("gaokao-question")?.style.display = "none";
  document.getElementById("dialogue-input-area")?.style.display = "none";
  document.getElementById("gaokao-actions")?.style.display = "none";

  yearMenu.innerHTML = ""; // Clear previous

  if (dataArr.length === 0) {
    console.warn(`No data for type: ${typeKey}`);
    yearMenu.innerHTML = `<p style="text-align:center; width:100%; padding: 1rem;">暫無 ${typeLabel} 類型的題目數據。</p>`;
  } else {
    const years = [...new Set(dataArr.map(item => item.year))].sort((a, b) => b - a);
    years.forEach(year => {
      const btn = document.createElement("button");
      btn.textContent = `${year} 年`;
      btn.onclick = () => showQuestionList(typeKey, year, dataArr);
      yearMenu.appendChild(btn);
    });
  }
  yearMenu.style.display = "flex"; // Show the year menu (or the 'no data' message)
}

/****************************************************
 * 显示该年份题目列表 (实际直接显示第一题)
 ****************************************************/
function showQuestionList(typeKey, year, dataArr) {
  resetChatState();
  const questions = dataArr.filter(item => item.year === year);
  const questionSec = document.getElementById("gaokao-question");
  const dialogueInputArea = document.getElementById("dialogue-input-area");
  const actionsSec = document.getElementById("gaokao-actions");
  const typeLabel = TYPES.find(t => t.key === typeKey)?.label || typeKey;

  if (!questionSec || !dialogueInputArea || !actionsSec) return;

  questionSec.innerHTML = `<h2 style="font-size:1.5rem;">${year} 年北京真題 (${typeLabel})</h2>`; // Clear and set title

  if (questions.length > 0) {
    showQuestionDetail(questions[0]);
    questionSec.style.display = "block"; // Ensure question section is visible
  } else {
    questionSec.innerHTML += `<p style="font-size:1.2rem;">${year} 年的 ${typeLabel} 題目暫無資料。</p>`;
    questionSec.style.display = "block"; // Show the 'no data' message
    dialogueInputArea.style.display = "none";
    actionsSec.style.display = "none";
  }
}


/****************************************************
 * 显示选中的题目内容
 ****************************************************/
function showQuestionDetail(question) {
  currentQuestion = question;
  resetChatState(); // Reset includes clearing messages/input

  const questionSec = document.getElementById("gaokao-question");
  const dialogueInputArea = document.getElementById("dialogue-input-area");
  const actionsSec = document.getElementById("gaokao-actions");

  if (!questionSec || !dialogueInputArea || !actionsSec) return;

  questionSec.innerHTML = formatQuestionHTML(question); // Format question content
  questionSec.style.display = "block";

  dialogueInputArea.style.display = "block";
  actionsSec.style.display = "block";
}


/****************************************************
 * 格式化题目内容 HTML (保持不變)
 ****************************************************/
function formatQuestionHTML(q) { /* ... (保持不變) ... */ }

/****************************************************
 * 生成 AI prompt (保持不變)
 ****************************************************/
function buildAIPrompt(q, mode, userAnswer = "") { /* ... (保持不變) ... */ }

/****************************************************
 * 呼叫 AI 並處理回复 (保持不變)
 ****************************************************/
function callAI(prompt) { /* ... (保持不變) ... */ }


/****************************************************
 * 参考答案显示 (保持不變)
 ****************************************************/
function showReferenceAnswer() { /* ... (保持不變) ... */ }

/****************************************************
 * 提交答案 / 深度聊天 (添加輸入框邊框提示)
 ****************************************************/
function submitAnswer() {
  if (!currentQuestion) {
    addMessage("請先選擇一道題目才能提交答案喔。", "ai");
    return;
  }
  const userAnswerEl = document.getElementById("userAnswer");
  if (!userAnswerEl) return; // Guard against missing element

  const answer = userAnswerEl.value.trim();

  if (!answer) {
    addMessage("你還沒有輸入任何內容呢！", "ai");
    // Visual cue for empty input
    userAnswerEl.style.borderColor = 'red'; // Use borderColor for better visibility
    userAnswerEl.style.outline = '1px solid red'; // Add outline too
    setTimeout(() => {
        userAnswerEl.style.borderColor = ''; // Reset to CSS default
        userAnswerEl.style.outline = '';
    }, 600);
    return;
  }

  addMessage(formatAnswer(answer), "user");

  userAnswerEl.value = "";
  userAnswerEl.style.height = 'auto';
  userAnswerEl.focus();

  const submitButton = document.getElementById("submit-answer-btn");

  if (isFirstSubmission) {
    const mode = currentQuestion.key === 'weixiezuo' || currentQuestion.key === 'dazuowen' || currentQuestion.reference_answer ? "review" : "solve";
    const prompt = buildAIPrompt(currentQuestion, mode, answer);
    callAI(prompt);
    isFirstSubmission = false;
    if (submitButton) submitButton.textContent = "深度聊天";
  } else {
    const chatPrompt = `（繼續對話）用戶說：\n"${answer}"\n\n請針對用戶的這句話進行回應、討論或回答。保持之前設定的（如果有的話）學長姐或閱卷官的語氣。`;
    callAI(chatPrompt);
  }
}

/****************************************************
 * 请求 AI 直接生成答案 (保持不變)
 ****************************************************/
function askAIForSolution() { /* ... (保持不變) ... */ }

/****************************************************
 * 夜晚模式切换 (保持不變)
 ****************************************************/
function toggleDarkMode() { /* ... (保持不變) ... */ }