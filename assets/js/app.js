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

// --- Prompts ---
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
};

/****************************************************
 * 辅助函数：格式化 AI 回答文本
 ****************************************************/
function formatAnswer(text) {
  if (typeof text !== 'string') {
    console.warn("formatAnswer received non-string input:", text);
    return "";
  }
  return text.split('\n').map(line => line.trim()).join('<br>');
}

/****************************************************
 * 辅助函数：显示消息 (无分隔符)
 ****************************************************/
function addMessage(message, sender = "ai") {
  const messagesEl = document.getElementById("messages");
  if (!messagesEl) return null;

  removeThinkingMessage();

  const div = document.createElement("div");
  div.className = sender === "user" ? "user-message" : "ai-message";
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
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
    })
    .then(json => {
      console.log("JSON data loaded successfully.");
      allData = json;

      const gaokaoBtn = document.getElementById("gaokao-btn");
      if (gaokaoBtn) {
          console.log("Found #gaokao-btn. Attaching click listener.");
          gaokaoBtn.addEventListener("click", () => {
              console.log("#gaokao-btn clicked! Calling showTypeMenu...");
              showTypeMenu();
          });
      } else {
          console.error("#gaokao-btn not found! Cannot attach listener.");
      }
    })
    .catch(err => {
      console.error("Failed to load or process data:", err);
      const mainEl = document.querySelector('main');
      const errorMsg = document.createElement('p');
      errorMsg.textContent = `數據加載失敗: ${err.message} 請刷新頁面重試。`;
      errorMsg.style.color = 'red';
      errorMsg.style.textAlign = 'center';
      errorMsg.style.padding = '1rem';
      if (mainEl) {
          mainEl.prepend(errorMsg);
      } else {
          document.body.prepend(errorMsg);
      }
       const gaokaoBtn = document.getElementById("gaokao-btn");
       if (gaokaoBtn) {
            gaokaoBtn.textContent = "數據加載失敗";
            gaokaoBtn.disabled = true;
       }
    }); // <<< Added semicolon

  // Attach other listeners
  document.getElementById("submit-answer-btn")?.addEventListener("click", submitAnswer); // <<< Added semicolon
  document.getElementById("reference-answer-btn")?.addEventListener("click", showReferenceAnswer); // <<< Added semicolon
  document.getElementById("ai-answer-btn")?.addEventListener("click", askAIForSolution); // <<< Added semicolon
  document.getElementById("toggle-dark-btn")?.addEventListener("click", toggleDarkMode); // <<< Added semicolon

  // Textarea setup
  const userAnswer = document.getElementById("userAnswer");
  if (userAnswer) {
      userAnswer.addEventListener("input", function() {
          this.style.height = 'auto';
          this.style.height = (this.scrollHeight) + 'px';
      }); // <<< Added semicolon

      userAnswer.addEventListener('keydown', function(event) {
          if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              document.getElementById("submit-answer-btn")?.click();
          }
      }); // <<< Added semicolon

    } else { // Correct brace IS here
      console.error("#userAnswer textarea not found.");
    } // <<< Added semicolon to close the else block statement

  // Apply saved dark mode preference
  if (localStorage.getItem("darkMode") === "enabled") { // Preceding statement now has semicolon
      document.body.classList.add("dark-mode"); // Line ~198 target
  } // <<< Added semicolon to close the if statement

}); // <<< Added semicolon to close the DOMContentLoaded listener

/****************************************************
 * 重置聊天状态
 ****************************************************/
function resetChatState() {
    isFirstSubmission = true;
    document.getElementById("submit-answer-btn")?.textContent = "提交答案";
    const messagesEl = document.getElementById("messages");
    if (messagesEl) {
        messagesEl.innerHTML = "";
    }
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
  console.log("Executing showTypeMenu...");
  const menu = document.getElementById("gaokao-type-menu");
  if (!menu) {
      console.error("#gaokao-type-menu element not found!");
      return;
  }

  menu.innerHTML = "";

  document.getElementById("gaokao-year-menu")?.style.display = "none";
  document.getElementById("gaokao-question")?.style.display = "none";
  document.getElementById("dialogue-input-area")?.style.display = "none";
  document.getElementById("gaokao-actions")?.style.display = "none";

  resetChatState();

  if (!Array.isArray(TYPES) || TYPES.length === 0) {
       console.error("TYPES data is invalid or empty.");
       menu.innerHTML = "<p>無法加載題型分類。</p>";
       menu.style.display = "block";
       return;
   }

  console.log(`Creating ${TYPES.length} type buttons.`);
  TYPES.forEach(t => {
    const btn = document.createElement("button");
    btn.textContent = t.label;
    btn.onclick = () => {
        console.log(`Type button "${t.label}" clicked.`);
        showYearMenu(t.key);
    };
    menu.appendChild(btn);
  });

  menu.style.display = "flex"; // Show menu AFTER adding buttons
  console.log("#gaokao-type-menu display set to 'flex'. Menu should be visible.");
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
  if (!yearMenu) {
      console.error("#gaokao-year-menu not found!");
      return;
  }

  document.getElementById("gaokao-question")?.style.display = "none";
  document.getElementById("dialogue-input-area")?.style.display = "none";
  document.getElementById("gaokao-actions")?.style.display = "none";

  yearMenu.innerHTML = "";

  if (dataArr.length === 0) {
    console.warn(`No data found for type: ${typeKey}`);
    yearMenu.innerHTML = `<p style="text-align:center; width:100%; padding: 1rem;">暫無 ${typeLabel} 類型的題目數據。</p>`;
  } else {
    const years = [...new Set(dataArr.map(item => item.year))].sort((a, b) => b - a);
    console.log(`Creating buttons for years: ${years.join(', ')}`);
    years.forEach(year => {
      const btn = document.createElement("button");
      btn.textContent = `${year} 年`;
      btn.onclick = () => {
          console.log(`Year button "${year}" clicked for type "${typeKey}".`);
          showQuestionList(typeKey, year, dataArr);
      };
      yearMenu.appendChild(btn);
    });
  }
  yearMenu.style.display = "flex";
  console.log("#gaokao-year-menu display set to 'flex'.");
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

  if (!questionSec || !dialogueInputArea || !actionsSec) {
      console.error("Missing required elements for displaying question list.");
      return;
  }

  questionSec.innerHTML = `<h2 style="font-size:1.5rem;">${year} 年北京真題 (${typeLabel})</h2>`;

  if (questions.length > 0) {
    console.log(`Found ${questions.length} question(s). Displaying the first one.`);
    questionSec.style.display = "block";
    showQuestionDetail(questions[0]);
  } else {
    console.warn(`No questions found for type: ${typeKey}, year: ${year}.`);
    questionSec.innerHTML += `<p style="font-size:1.2rem;">${year} 年的 ${typeLabel} 題目暫無資料。</p>`;
    questionSec.style.display = "block";
    dialogueInputArea.style.display = "none";
    actionsSec.style.display = "none";
  }
}


/****************************************************
 * 显示选中的题目内容
 ****************************************************/
function showQuestionDetail(question) {
    if (!question || typeof question !== 'object') {
        console.error("Invalid question data passed to showQuestionDetail:", question);
        const questionSec = document.getElementById("gaokao-question");
        if(questionSec) {
            questionSec.innerHTML = "<p style='color:red;'>錯誤：無法加載題目詳情。</p>";
            questionSec.style.display = "block";
        }
        document.getElementById("dialogue-input-area")?.style.display = "none";
        document.getElementById("gaokao-actions")?.style.display = "none";
        return;
    }

  console.log(`Showing details for question: ${question.year} ${question.key}`);
  currentQuestion = question;
  resetChatState();

  const questionSec = document.getElementById("gaokao-question");
  const dialogueInputArea = document.getElementById("dialogue-input-area");
  const actionsSec = document.getElementById("gaokao-actions");

  if (!questionSec || !dialogueInputArea || !actionsSec) {
      console.error("Missing required elements for displaying question detail.");
      return;
  }

  questionSec.innerHTML = formatQuestionHTML(question);
  questionSec.style.display = "block";

  dialogueInputArea.style.display = "block";
  actionsSec.style.display = "block";
  console.log("Question details, dialogue area, and actions displayed.");
}


/****************************************************
 * 格式化题目内容 HTML (Added Validation)
 ****************************************************/
function formatQuestionHTML(q) {
    if (!q || typeof q !== 'object') {
        console.error("Invalid question data in formatQuestionHTML:", q);
        return "<p style='color:red;'>錯誤：題目數據格式不正確。</p>";
    }

    const typeLabel = TYPES.find(t => t.key === q.key)?.label || q.key || '未知題型';
    const yearLabel = q.year || '未知年份';
    const topicLabel = q.topic || '';

    let html = `<h2 style="font-size:1.5rem;">${yearLabel}年 ${typeLabel} ${topicLabel ? '- ' + topicLabel : ''}</h2>`;

    const formatTextWithNewlines = (text) => {
        if (!text || typeof text !== 'string') return '';
        return text.split('\n').map(line => `<span class="formatted-line">${line.trim()}</span>`).join('');
    };

    if (q.material1) html += `<div><strong>材料1：</strong>${formatTextWithNewlines(q.material1)}</div>`;
    if (q.material2) html += `<div><strong>材料2：</strong>${formatTextWithNewlines(q.material2)}</div>`;
    if (q.material3) html += `<div><strong>材料3：</strong>${formatTextWithNewlines(q.material3)}</div>`;

    let questionHtml = '';
    for (let i = 1; i <= 10; i++) {
        if (q[`question${i}`]) {
            questionHtml += `<p><strong>問題${i}：</strong>${formatTextWithNewlines(q[`question${i}`])}</p>`;
        }
    }
    if (questionHtml) html += `<div style="margin-top: 1em;">${questionHtml}</div>`;

    if (q.prompts && Array.isArray(q.prompts)) {
        let promptHtml = '';
        q.prompts.forEach((p, idx) => {
            if (p && typeof p === 'object' && p.prompt_text) {
                promptHtml += `<p><strong>作文提示${idx + 1}：</strong>${formatTextWithNewlines(p.prompt_text)}</p>`;
            }
        });
        if (promptHtml) html += `<div style="margin-top: 1em;">${promptHtml}</div>`;
    }
    return html;
}


/****************************************************
 * 生成 AI prompt (Added Validation)
 ****************************************************/
function buildAIPrompt(q, mode, userAnswer = "") {
    if (!q || typeof q !== 'object') {
        console.error("Invalid question data in buildAIPrompt:", q);
        return "錯誤：題目數據無效。"; // Return error string
    }

    const promptKey = q.key || 'default';
    let base = `${GAOKAO_PROMPTS[promptKey] || GAOKAO_PROMPTS.default}\n\n**題目信息：**\n`;

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
            if (p && typeof p === 'object' && p.prompt_text) {
                promptText += `提示${idx + 1}：${p.prompt_text}\n`;
            }
        });
        if (promptText) base += "**作文提示：**\n" + promptText + "\n";
    }

    if (q.key === "weixiezuo") base += `\n**評分要求 (微寫作):**\n${MICRO_WRITING_INSTRUCTIONS}\n`;
    else if (q.key === "dazuowen") base += `\n**評分要求 (大作文):**\n${LONG_ESSAY_INSTRUCTIONS}\n`;

    if (mode === "review") {
        base += `\n**學生答案：**\n${userAnswer || "(未提供)"}\n\n`;
        if (q.reference_answer) base += `**參考答案：**\n${q.reference_answer}\n\n`;
        base += `**任務：** 請嚴格按照前面的評分要求（如果適用），評估學生的答案，指出優缺點，提供具體改進建議，並給出分數（如果適用）。如果沒有評分要求，請分析學生答案的合理性、完整性和準確性。`;
    } else {
        if (userAnswer) base += `\n**學生嘗試的答案（供參考）：**\n${userAnswer}\n\n`;
        base += `**任務：** 請你來回答這個問題。請用友善、清晰、略帶俏皮的語氣回答，就像一位樂於助人的學長姐在耐心講解。如果題目是寫作類，請直接按要求寫作。`;
    }
    base += "\n\n**風格提示：** 請使用繁體中文回答。";
    return base;
}


/****************************************************
 * 呼叫 AI 並處理回复 (Improved Error Handling)
 ****************************************************/
function callAI(prompt) {
    if (typeof prompt !== 'string' || !prompt.trim()) {
        console.error("Invalid prompt passed to callAI:", prompt);
        addMessage("內部錯誤：無法向 AI 發送有效請求。", "ai");
        return;
    }

    removeThinkingMessage();
    const timeoutId = setTimeout(() => {
        if (!thinkingMessageElement) {
             thinkingMessageElement = addMessage("<em class='thinking-message'>AI 正在想啊想啊，耐個心吧 🐶🦊🐹 ...</em>", "ai");
        }
    }, 200);

    fetch(CLOUD_FLARE_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ prompt: prompt })
    })
    .then(res => {
        clearTimeout(timeoutId);
        removeThinkingMessage();
        if (!res.ok) {
            return res.text().then(text => {
                 let errorMsg = `請求失敗 (${res.status} ${res.statusText})`;
                 try {
                     const errorJson = JSON.parse(text);
                     errorMsg = errorJson?.error || errorJson?.message || errorMsg;
                 } catch (e) {
                     if (text && text.length < 200) errorMsg += `: ${text}`;
                 }
                 throw new Error(errorMsg);
            });
        }
        return res.json();
    })
    .then(json => {
        if (json && json.answer) {
            addMessage(`${formatAnswer(json.answer)}`, "ai");
        } else {
             console.error("AI response missing 'answer':", json);
             throw new Error("AI 回應的格式不正確或為空。");
        }
    })
    .catch(err => {
        console.error("AI request/processing error:", err);
        clearTimeout(timeoutId);
        removeThinkingMessage();
        addMessage(`與 AI 連接時發生錯誤：<br><small>${err.message || "未知錯誤"}</small>`, "ai");
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
    addMessage("抱歉，這道題的參考答案還沒有準備好哦。", "ai");
  }
}

/****************************************************
 * 提交答案 / 深度聊天
 ****************************************************/
function submitAnswer() {
  if (!currentQuestion) {
    addMessage("請先選個題目再提交答案吧！", "ai");
    return;
  }
  const userAnswerEl = document.getElementById("userAnswer");
  if (!userAnswerEl) return;

  const answer = userAnswerEl.value.trim();

  if (!answer) {
    addMessage("好像忘了輸入內容哦？", "ai");
    userAnswerEl.style.outline = '2px solid orange';
    setTimeout(() => { userAnswerEl.style.outline = ''; }, 700);
    return;
  }

  addMessage(formatAnswer(answer), "user");

  userAnswerEl.value = "";
  userAnswerEl.style.height = 'auto';
  userAnswerEl.focus();

  const submitButton = document.getElementById("submit-answer-btn");

  if (isFirstSubmission) {
    const mode = (currentQuestion.key === 'weixiezuo' || currentQuestion.key === 'dazuowen' || currentQuestion.reference_answer) ? "review" : "solve";
    const prompt = buildAIPrompt(currentQuestion, mode, answer);
    callAI(prompt);
    isFirstSubmission = false;
    if (submitButton) {
        submitButton.textContent = "深度聊天";
    }
  } else {
    const chatPrompt = `（繼續對話）用戶說：\n"${answer}"\n\n請針對用戶的這句話進行回應、討論或回答。保持之前設定的（如果有的話）學長姐或閱卷官的語氣。`;
    callAI(chatPrompt);
  }
}

/****************************************************
 * 请求 AI 直接生成答案
 ****************************************************/
function askAIForSolution() {
  if (!currentQuestion) {
    addMessage("要先選個題目，我才能幫你想答案呀！", "ai");
    return;
  }

  addMessage("收到！正在努力生成 AI 答案...", "ai");

  const prompt = buildAIPrompt(currentQuestion, "solve");
  callAI(prompt);

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
  if (document.body.classList.contains("dark-mode")) {
      localStorage.setItem("darkMode", "enabled");
      console.log("Dark mode enabled and saved.");
  } else {
      localStorage.setItem("darkMode", "disabled");
      console.log("Dark mode disabled and saved.");
  }
}

// --- End of app.js ---