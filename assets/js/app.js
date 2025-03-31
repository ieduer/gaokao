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
    // console.warn("formatAnswer received non-string input:", text);
    return "";
  }
  // Replace potential markdown list items with HTML lists for better rendering
  let html = text.replace(/^\s*-\s+/gm, '<li>').replace(/^\s*\*\s+/gm, '<li>');
  // Basic newline to <br> conversion, handle potential list closing
  html = html.split('\n').map(line => {
      line = line.trim();
      if (line.startsWith('<li>')) {
          return line + '</li>'; // Close list item
      }
      return line;
  }).join('<br>');

  // Wrap consecutive list items in <ul> - simple approach
  html = html.replace(/(<li>.*?<\/li>)(<br\s*\/?>)?(?=<li>)/g, '$1'); // Remove <br> between list items
  html = html.replace(/(?:<br\s*\/?>)*(<li>.*?<\/li>)(?:<br\s*\/?>)*/g, '$1'); // Clean <br> around items
  if (html.includes('<li>')) {
      html = html.replace(/(<li>.*?<\/li>(?:<br\s*\/?>)*)+/g, '<ul>$&</ul>');
      // Clean up potential double ul tags if formatting was complex
      html = html.replace(/<\/ul>(<br\s*\/?>)*<ul>/g, '');
      // Remove <br> directly before or after the list
       html = html.replace(/<br\s*\/?>\s*<ul>/g, '<ul>');
       html = html.replace(/<\/ul>\s*<br\s*\/?>/g, '</ul>');
  }
   // Replace numbered lists (e.g., 1. item)
   html = html.replace(/^\s*(\d+)\.\s+(.*?)($|<br>)/gm, (match, num, content, end) => {
        // Check if already inside a list item tag (might happen with nested structures)
        if (content.trim().startsWith('<') && content.trim().endsWith('>')) {
             return match; // Avoid double wrapping
        }
        return `<ol start="${num}"><li>${content.trim()}</li></ol>${end === '<br>' ? '<br>' : ''}`;
    });
    // Consolidate adjacent <ol><li> blocks
    html = html.replace(/<\/li><\/ol>(<br\s*\/?>)?<ol start="\d+"><li>/g, '</li><li>');


  // Handle bold text (**text**)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Handle italic text (*text* or _text_)
  html = html.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em>$1</em>'); // Single asterisks
  html = html.replace(/_(.*?)_/g, '<em>$1</em>'); // Underscores

  return html;
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
  // Use innerHTML because formatAnswer returns HTML string
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
    } else {
      console.error("#userAnswer textarea not found.");
    }

  // Apply saved dark mode preference
  console.log("Checking dark mode preference...");
  if (localStorage.getItem("darkMode") === "enabled") {
      console.log("Dark mode preference found: enabled. Adding class...");
      document.body.classList.add("dark-mode");
      console.log("dark-mode class added to body.");
  } // <<< CORRECTED: Removed the erroneous semicolon from here

}); // <<< DOMContentLoaded listener ends here

/****************************************************
 * 重置聊天状态
 ****************************************************/
function resetChatState() {
  isFirstSubmission = true;

  // Correct way to set textContent safely:
  const submitButton = document.getElementById("submit-answer-btn");
  if (submitButton) {
      submitButton.textContent = "提交答案";
  }

  const messagesEl = document.getElementById("messages");
  if (messagesEl) {
      messagesEl.innerHTML = "";
  }
  const userAnswer = document.getElementById("userAnswer");
  if (userAnswer) {
      userAnswer.value = "";
      userAnswer.style.height = 'auto'; // Reset height
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

  menu.innerHTML = ""; // Clear previous buttons if any

/****************************************************
 * 重置聊天状态
 ****************************************************/
function resetChatState() {
  isFirstSubmission = true;

  // Correct way to set textContent safely:
  const submitButton = document.getElementById("submit-answer-btn");
  if (submitButton) {
      submitButton.textContent = "提交答案";
  }

  const messagesEl = document.getElementById("messages");
  if (messagesEl) {
      messagesEl.innerHTML = "";
  }
  const userAnswer = document.getElementById("userAnswer");
  if (userAnswer) {
      userAnswer.value = "";
      userAnswer.style.height = 'auto'; // Reset height
      userAnswer.placeholder = "請輸入你的答案或想聊的話題…";
  }
  removeThinkingMessage();
}

  resetChatState(); // Reset chat when changing views

  if (!Array.isArray(TYPES) || TYPES.length === 0) {
       console.error("TYPES data is invalid or empty.");
       menu.innerHTML = "<p>無法加載題型分類。</p>";
       menu.style.display = "block"; // Show the error message
       return;
   }

  console.log(`Creating ${TYPES.length} type buttons.`);
  TYPES.forEach(t => {
    const btn = document.createElement("button");
    btn.textContent = t.label;
    btn.onclick = () => {
        console.log(`Type button "${t.label}" (${t.key}) clicked.`);
        showYearMenu(t.key);
    };
    menu.appendChild(btn);
  });

  menu.style.display = "flex"; // Show menu AFTER adding buttons
  console.log("#gaokao-type-menu display set to 'flex'. Menu should be visible.");

  // Scroll the type menu into view if needed, especially on mobile
  menu.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

  // Hide question/dialogue sections
  document.getElementById("gaokao-question")?.style.display = "none";
  document.getElementById("dialogue-input-area")?.style.display = "none";
  document.getElementById("gaokao-actions")?.style.display = "none";

  yearMenu.innerHTML = ""; // Clear previous year buttons

  if (dataArr.length === 0) {
    console.warn(`No data found for type: ${typeKey}`);
    yearMenu.innerHTML = `<p style="text-align:center; width:100%; padding: 1rem;">暫無 ${typeLabel} 類型的題目數據。</p>`;
  } else {
    const years = [...new Set(dataArr.map(item => item.year))].sort((a, b) => b - a); // Sort descending
    console.log(`Creating buttons for years: ${years.join(', ')}`);
    years.forEach(year => {
      const btn = document.createElement("button");
      btn.textContent = `${year} 年`;
      btn.onclick = () => {
          console.log(`Year button "${year}" clicked for type "${typeKey}".`);
          // Pass the already filtered data to avoid re-filtering
          showQuestionList(typeKey, year, dataArr.filter(item => item.year === year));
      };
      yearMenu.appendChild(btn);
    });
  }
  yearMenu.style.display = "flex"; // Show the year menu
  console.log("#gaokao-year-menu display set to 'flex'.");
  yearMenu.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/****************************************************
 * 显示该年份题目列表 (实际显示第一题)
 ****************************************************/
function showQuestionList(typeKey, year, questionsForYear) { // Changed dataArr to questionsForYear
  console.log(`Showing question list for type: ${typeKey}, year: ${year}`);
  resetChatState();

  // No need to filter again, questionsForYear already contains the correct items
  // const questions = dataArr.filter(item => item.year === year); // Removed this line

  const questionSec = document.getElementById("gaokao-question");
  const dialogueInputArea = document.getElementById("dialogue-input-area");
  const actionsSec = document.getElementById("gaokao-actions");
  const typeLabel = TYPES.find(t => t.key === typeKey)?.label || typeKey;

  if (!questionSec || !dialogueInputArea || !actionsSec) {
      console.error("Missing required elements for displaying question list.");
      return;
  }

  // Clear previous question content but keep the header structure
  questionSec.innerHTML = `<h2 style="font-size:1.5rem;">${year} 年北京真題 (${typeLabel})</h2>`; // Set title first

  if (questionsForYear.length > 0) {
    console.log(`Found ${questionsForYear.length} question(s). Displaying the first one.`);
    questionSec.style.display = "block"; // Ensure section is visible
    showQuestionDetail(questionsForYear[0]); // Display the first question of that year/type
  } else {
    // This case should technically not happen if showYearMenu found years,
    // but handle it defensively.
    console.warn(`No questions found for type: ${typeKey}, year: ${year}.`);
    questionSec.innerHTML += `<p style="font-size:1.2rem;">${year} 年的 ${typeLabel} 題目暫無資料。</p>`; // Append message
    questionSec.style.display = "block"; // Ensure section is visible
    // Hide interaction areas if no question
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
            // Keep the title from showQuestionList, just add error message
            questionSec.innerHTML += "<p style='color:red;'>錯誤：無法加載題目詳情。</p>";
            questionSec.style.display = "block";
        }
        // Hide interaction areas on error
        document.getElementById("dialogue-input-area")?.style.display = "none";
        document.getElementById("gaokao-actions")?.style.display = "none";
        return;
    }

  console.log(`Showing details for question: ${question.year} ${question.key}`);
  currentQuestion = question; // Set the global current question
  resetChatState(); // Reset chat for the new question

  const questionSec = document.getElementById("gaokao-question");
  const dialogueInputArea = document.getElementById("dialogue-input-area");
  const actionsSec = document.getElementById("gaokao-actions");

  if (!questionSec || !dialogueInputArea || !actionsSec) {
      console.error("Missing required elements for displaying question detail.");
      return;
  }

  // Format and display the question content (appends to existing H2 title)
  questionSec.innerHTML += formatQuestionHTML(question); // Append formatted content
  questionSec.style.display = "block"; // Ensure it's visible

  // Show interaction areas
  dialogueInputArea.style.display = "block";
  actionsSec.style.display = "block";
  console.log("Question details, dialogue area, and actions displayed.");

  // Scroll the question into view
  questionSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


/****************************************************
 * 格式化题目内容 HTML (Added Validation)
 ****************************************************/
function formatQuestionHTML(q) {
    // NOTE: This function now *appends* HTML to the existing H2 in the question section
    if (!q || typeof q !== 'object') {
        console.error("Invalid question data in formatQuestionHTML:", q);
        return "<p style='color:red;'>錯誤：題目數據格式不正確。</p>";
    }

    // The H2 title is now set in showQuestionList/showQuestionDetail
    let html = ''; // Start with an empty string to append content

    // Helper to format text with proper line breaks using spans
    const formatTextWithNewlines = (text) => {
        if (!text || typeof text !== 'string') return '';
        // Trim each line and filter out empty lines after trimming
        return text.split('\n')
                   .map(line => line.trim())
                   .filter(line => line.length > 0)
                   .map(line => `<span class="formatted-line">${line}</span>`)
                   .join(''); // Join remaining lines without extra <br>, handled by span's display:block
    };


    // Add materials if they exist
    if (q.material1) html += `<div style="margin-top: 1em;"><strong>材料1：</strong>${formatTextWithNewlines(q.material1)}</div>`;
    if (q.material2) html += `<div style="margin-top: 1em;"><strong>材料2：</strong>${formatTextWithNewlines(q.material2)}</div>`;
    if (q.material3) html += `<div style="margin-top: 1em;"><strong>材料3：</strong>${formatTextWithNewlines(q.material3)}</div>`;

    // Add questions if they exist
    let questionHtml = '';
    for (let i = 1; i <= 10; i++) { // Assuming max 10 questions based on previous code
        const questionKey = `question${i}`;
        if (q[questionKey]) {
            questionHtml += `<p style="margin-top: 0.8em;"><strong>問題 ${i}：</strong>${formatTextWithNewlines(q[questionKey])}</p>`;
        }
    }
     if (questionHtml) {
        // Add a general "问题：" heading only if there are multiple questions, or specific context needs it.
        // For single questions, the "問題 1：" prefix might be enough.
        // Let's add a separator/margin before the questions start.
        html += `<div style="margin-top: 1.2em;">${questionHtml}</div>`;
    }


    // Add prompts (for essays etc.)
    if (q.prompts && Array.isArray(q.prompts) && q.prompts.length > 0) {
        let promptHtml = '<div style="margin-top: 1.2em;"><strong>寫作要求：</strong>';
        q.prompts.forEach((p, idx) => {
            // Check if p is an object and has prompt_text
            if (p && typeof p === 'object' && p.prompt_text) {
                 // Use formatTextWithNewlines for prompt text as well
                 promptHtml += `<p style="margin-left: 1em; margin-top: 0.5em;">(${idx + 1}) ${formatTextWithNewlines(p.prompt_text)}</p>`;
            } else if (typeof p === 'string') { // Handle if prompts are just strings in the array
                 promptHtml += `<p style="margin-left: 1em; margin-top: 0.5em;">(${idx + 1}) ${formatTextWithNewlines(p)}</p>`;
            }
        });
        promptHtml += '</div>';
        html += promptHtml;
    }

    return html; // Return the generated HTML string for materials, questions, prompts
}


/****************************************************
 * 生成 AI prompt (Added Validation)
 ****************************************************/
function buildAIPrompt(q, mode, userAnswer = "") {
    if (!q || typeof q !== 'object') {
        console.error("Invalid question data in buildAIPrompt:", q);
        return "錯誤：題目數據無效。無法生成提示。"; // Return error string
    }

    const promptKey = q.key || 'default';
    let basePrompt = `${GAOKAO_PROMPTS[promptKey] || GAOKAO_PROMPTS.default}\n\n**題目信息：**\n`;
    basePrompt += `年份: ${q.year || '未知'}\n`;
    basePrompt += `題型: ${TYPES.find(t => t.key === q.key)?.label || q.key || '未知'}\n`;
    if (q.topic) basePrompt += `主題: ${q.topic}\n`;
    basePrompt += "\n"; // Add a separator line

    // Append Materials
    if (q.material1) basePrompt += `**材料1：**\n${q.material1}\n\n`;
    if (q.material2) basePrompt += `**材料2：**\n${q.material2}\n\n`;
    if (q.material3) basePrompt += `**材料3：**\n${q.material3}\n\n`;

    // Append Questions
    let questionText = "";
    for (let i = 1; i <= 10; i++) {
        if (q[`question${i}`]) {
            questionText += `問題 ${i}： ${q[`question${i}`]}\n`;
        }
    }
    if (questionText) basePrompt += `**問題：**\n${questionText}\n`;

    // Append Prompts (Essay Requirements)
    if (q.prompts && Array.isArray(q.prompts) && q.prompts.length > 0) {
        basePrompt += "**寫作要求：**\n";
        q.prompts.forEach((p, idx) => {
             if (p && typeof p === 'object' && p.prompt_text) {
                basePrompt += `(${idx + 1}) ${p.prompt_text}\n`;
            } else if (typeof p === 'string') {
                 basePrompt += `(${idx + 1}) ${p}\n`;
            }
        });
        basePrompt += "\n";
    }

    // Add specific instructions based on type
    if (q.key === "weixiezuo") {
        basePrompt += `\n**評分要求 (微寫作):**\n${MICRO_WRITING_INSTRUCTIONS}\n\n`;
    } else if (q.key === "dazuowen") {
        basePrompt += `\n**評分要求 (大作文):**\n${LONG_ESSAY_INSTRUCTIONS}\n\n`;
    }

    // Add user answer and task based on mode
    if (mode === "review") {
        basePrompt += `**學生答案：**\n${userAnswer || "(學生未提供答案)"}\n\n`;
        if (q.reference_answer) {
            basePrompt += `**參考答案 (供AI參考，不用展示給學生)：**\n${q.reference_answer}\n\n`;
        }
        basePrompt += `**任務：** 請嚴格按照前面的評分要求（特別是微寫作或大作文的格式要求），評估學生的答案。請指出優點和缺點，提供具體的改進建議。如果是寫作題，請務必給出等級和分數。如果是非寫作題，請分析學生答案的合理性、完整性和準確性，並說明理由。`;

    } else if (mode === "solve") { // AI is asked to solve the question
         if (userAnswer) {
             // Include user's attempt if they provided one before clicking "AI答案"
             basePrompt += `\n**學生之前的嘗試（僅供AI參考，不用在回答中提及）：**\n${userAnswer}\n\n`;
         }
         basePrompt += `**任務：** 請你來回答或完成這個題目。請用友善、清晰、略帶俏皮的語氣回答，如同一個樂於助人的學長姐在耐心講解。如果題目是寫作類（微寫作/大作文），請直接按照要求進行寫作，產出一篇符合要求的範文。`;
    } else { // Default mode (e.g., chat after initial submission)
        basePrompt += `**用戶輸入：**\n"${userAnswer}"\n\n`;
        basePrompt += `**任務：** 請針對用戶的這句話，基於之前的題目和對話上下文，進行回應、討論或回答。保持之前設定的（如果有的話）學長姐、閱卷官或一般助手的語氣。`;

    }

    basePrompt += "\n\n**風格提示：** 請始終使用繁體中文回答。";
    return basePrompt;
}


/****************************************************
 * 呼叫 AI 並處理回复 (Improved Error Handling)
 ****************************************************/
async function callAI(prompt) { // Made async for potential await later if needed
    if (typeof prompt !== 'string' || !prompt.trim()) {
        console.error("Invalid prompt passed to callAI:", prompt);
        addMessage("內部錯誤：無法向 AI 發送有效請求。", "ai");
        return;
    }

    removeThinkingMessage(); // Remove any previous thinking message
    // Show thinking message immediately
    thinkingMessageElement = addMessage("<em class='thinking-message'>AI 正在思考中，請稍候... 🧠✨</em>", "ai");


    try {
        const response = await fetch(CLOUD_FLARE_WORKER_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({ prompt: prompt })
        });

        removeThinkingMessage(); // Remove thinking message once response starts coming back

        if (!response.ok) {
            let errorMsg = `請求失敗 (${response.status} ${response.statusText})`;
            try {
                // Try to get more detailed error from response body
                const errorBody = await response.text();
                errorMsg += `: ${errorBody.substring(0, 200)}`; // Limit length
            } catch (e) {
                // Ignore if reading body fails
            }
            throw new Error(errorMsg);
        }

        const json = await response.json();

        if (json && json.answer) {
            // Format the answer using the enhanced formatAnswer function
            addMessage(formatAnswer(json.answer), "ai");
        } else {
             console.error("AI response missing 'answer' field or is empty:", json);
             throw new Error("AI 回應的格式不正確或為空。");
        }

    } catch (err) {
        console.error("AI request/processing error:", err);
        removeThinkingMessage(); // Ensure thinking message is removed on error
        // Provide a more user-friendly error message
        addMessage(`與 AI 連接時發生錯誤，請稍後再試。<br><small>錯誤詳情: ${err.message || "未知網路或服務器問題"}</small>`, "ai");
    }
}


/****************************************************
 * 参考答案显示
 ****************************************************/
function showReferenceAnswer() {
  if (!currentQuestion) {
    addMessage("請先選擇一道題目，才能看參考答案哦。", "ai");
    return;
  }
  removeThinkingMessage(); // Clear thinking message if any

  if (currentQuestion.reference_answer) {
    // Use formatAnswer to potentially format the reference answer too
    addMessage(`<strong>參考答案：</strong><br/>${formatAnswer(currentQuestion.reference_answer)}`, "ai");
  } else {
    addMessage("抱歉，這道題目的參考答案暫時還沒有收錄。", "ai");
  }
  // Scroll to the new message
   const messagesEl = document.getElementById("messages");
   if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
}

/****************************************************
 * 提交答案 / 深度聊天
 ****************************************************/
function submitAnswer() {
  if (!currentQuestion) {
    addMessage("請先選個題目再提交答案或聊天吧！", "ai");
    return;
  }
  const userAnswerEl = document.getElementById("userAnswer");
  if (!userAnswerEl) {
      console.error("#userAnswer element not found.");
      return;
  }

  const answer = userAnswerEl.value.trim();

  if (!answer) {
    addMessage("好像忘了輸入內容哦？寫點什麼吧！😊", "ai");
    // Simple visual feedback
    userAnswerEl.style.borderColor = 'orange';
    userAnswerEl.focus();
    setTimeout(() => {
        userAnswerEl.style.borderColor = ''; // Reset border color
        // Reset to dark mode border if applicable
        if (document.body.classList.contains('dark-mode')) {
             userAnswerEl.style.borderColor = '#555';
        } else {
             userAnswerEl.style.borderColor = '#ccc';
        }
    }, 1000);
    return;
  }

  // Display user's message first
  addMessage(formatAnswer(answer), "user"); // Format user input potentially too

  // Clear the input textarea and reset its height
  userAnswerEl.value = "";
  userAnswerEl.style.height = 'auto';
  // Optionally, keep focus for quick follow-up
  // userAnswerEl.focus();

  const submitButton = document.getElementById("submit-answer-btn");
  let prompt = "";

  if (isFirstSubmission) {
    console.log("First submission for this question.");
    // Determine mode: review for writing/answerable types, solve otherwise? Or always review first?
    // Let's default to "review" mode if it's an essay or has a reference answer, otherwise treat as chat/solve attempt.
    const isWriting = currentQuestion.key === 'weixiezuo' || currentQuestion.key === 'dazuowen';
    const hasReference = !!currentQuestion.reference_answer;
    // If it's writing or has a reference, assume the user wants it reviewed.
    // Otherwise, maybe they are just trying to answer a non-essay Q. Let's use 'review' mode here too, AI can adapt.
    const mode = "review";
    prompt = buildAIPrompt(currentQuestion, mode, answer);

    isFirstSubmission = false; // Mark that the first submission has happened
    if (submitButton) {
        submitButton.textContent = "深度聊天"; // Change button text
    }
  } else {
    console.log("Follow-up submission (chat mode).");
    // Treat subsequent submissions as chat/follow-up questions
    prompt = buildAIPrompt(currentQuestion, "chat", answer); // Use a specific 'chat' mode or reuse 'review'/'solve'? Let's use 'chat'.
  }

  // Call the AI with the constructed prompt
  callAI(prompt);
}

/****************************************************
 * 请求 AI 直接生成答案
 ****************************************************/
function askAIForSolution() {
  if (!currentQuestion) {
    addMessage("要先選個題目，我才能幫你想答案呀！", "ai");
    return;
  }

  // Provide immediate feedback to the user
  addMessage("收到！正在請求 AI 直接生成這道題的答案...", "ai");

  // Get user's current input in textarea, maybe they started typing?
  // Pass it as context, but AI's task is to generate *its* solution.
  const userAnswerEl = document.getElementById("userAnswer");
  const currentInput = userAnswerEl ? userAnswerEl.value.trim() : "";

  const prompt = buildAIPrompt(currentQuestion, "solve", currentInput); // Use "solve" mode
  callAI(prompt);

  // If this is the first interaction, change the submit button state
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
  const isDarkMode = document.body.classList.contains("dark-mode");
  if (isDarkMode) {
      localStorage.setItem("darkMode", "enabled");
      console.log("Dark mode enabled and saved.");
  } else {
      localStorage.setItem("darkMode", "disabled"); // Changed from "null" to "disabled" for clarity
      console.log("Dark mode disabled and saved.");
  }
   // Update textarea border color immediately after toggle
    const userAnswer = document.getElementById("userAnswer");
    if(userAnswer) {
        userAnswer.style.borderColor = isDarkMode ? '#555' : '#ccc';
    }
}

// --- End of app.js ---