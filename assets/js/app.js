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
    return "";
  }
  // Basic Markdown to HTML conversion
  let html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
    .replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em>$1</em>') // Italics (*)
    .replace(/_(.*?)_/g, '<em>$1</em>'); // Italics (_)

  // Handle lists (simple unordered and ordered)
  html = html.replace(/^\s*[\-\*]\s+(.*)/gm, '<li>$1</li>');
  html = html.replace(/^\s*(\d+)\.\s+(.*)/gm, '<li>$1. $2</li>'); // Keep number for ordered

  // Wrap consecutive list items in appropriate tags
  html = html.replace(/^(<li>.*<\/li>\s*)+/gm, (match) => {
    if (match.includes('<li>1.')) { // Simple check for ordered list start
       // Basic handling: wrap in <ol>, remove numbers within <li> if desired (complex)
       // Keeping numbers for now as per replacement above.
        return `<ol>${match.replace(/<\/li>\s*<li>/g, '</li><li>')}</ol>`;
    } else {
        return `<ul>${match.replace(/<\/li>\s*<li>/g, '</li><li>')}</ul>`;
    }
  });
   // Remove extra whitespace between list tags and list items
   html = html.replace(/<\/ul>\s*<ul>/g, '');
   html = html.replace(/<\/ol>\s*<ol>/g, '');


  // Convert newlines to <br>, being careful around block elements
  html = html.split('\n').map(line => {
    line = line.trim();
    // Avoid adding <br> inside or directly adjacent to list/block tags if line is empty
    if (line.length === 0 || /^(<\/?(ul|ol|li|p|div|h[1-6]|blockquote|strong|em)>)/i.test(line)) {
      return line;
    }
    return line + '<br>';
  }).join('');

  // Clean up potential excessive <br> tags
  html = html.replace(/(<br\s*\/?>\s*){2,}/gi, '<br>'); // Replace multiple <br> with one
  html = html.replace(/<\/(ul|ol|li|p|div|h[1-6]|blockquote)><br>/gi, '</$1>'); // Remove <br> after block elements
  html = html.replace(/<br><(ul|ol|li|p|div|h[1-6]|blockquote)/gi, '<$1'); // Remove <br> before block elements

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
  div.innerHTML = message; // Already formatted by formatAnswer
  messagesEl.appendChild(div);

  // Scroll to the bottom
  messagesEl.scrollTop = messagesEl.scrollHeight;

  return div;
}


/****************************************************
 * 辅助函数：移除 "正在思考" 消息
 ****************************************************/
function removeThinkingMessage() {
    if (thinkingMessageElement && thinkingMessageElement.parentNode) {
        try {
            // Check parentNode again before removal, just in case
            if (thinkingMessageElement.parentNode === document.getElementById("messages")) {
                 thinkingMessageElement.parentNode.removeChild(thinkingMessageElement);
            }
        } catch (e) { console.warn("Error removing thinking message:", e); } // Log warning if removal fails
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
          gaokaoBtn.addEventListener("click", showTypeMenu); // Directly call function
      } else {
          console.error("#gaokao-btn not found! Cannot attach listener.");
      }
    })
    .catch(err => {
      console.error("Failed to load or process data:", err);
      const mainEl = document.querySelector('main');
      let errorMsgEl = document.getElementById('data-load-error'); // Check if error message exists
      if (!errorMsgEl) { // Create if it doesn't
          errorMsgEl = document.createElement('p');
          errorMsgEl.id = 'data-load-error';
          errorMsgEl.style.color = 'red';
          errorMsgEl.style.textAlign = 'center';
          errorMsgEl.style.padding = '1rem';
          if (mainEl) {
              mainEl.prepend(errorMsgEl); // Prepend to main
          } else {
              document.body.prepend(errorMsgEl); // Prepend to body if main not found
          }
      }
      errorMsgEl.textContent = `數據加載失敗: ${err.message} 請刷新頁面重試。`; // Update text

       const gaokaoBtn = document.getElementById("gaokao-btn");
       if (gaokaoBtn) {
            gaokaoBtn.textContent = "數據加載失敗";
            gaokaoBtn.disabled = true;
       }
    });

  // Attach other listeners
  const submitBtn = document.getElementById("submit-answer-btn");
  if (submitBtn) submitBtn.addEventListener("click", submitAnswer);

  const refBtn = document.getElementById("reference-answer-btn");
  if (refBtn) refBtn.addEventListener("click", showReferenceAnswer);

  const aiBtn = document.getElementById("ai-answer-btn");
  if (aiBtn) aiBtn.addEventListener("click", askAIForSolution);

  const toggleBtn = document.getElementById("toggle-dark-btn");
  if (toggleBtn) toggleBtn.addEventListener("click", toggleDarkMode);

  // Textarea setup
  const userAnswer = document.getElementById("userAnswer");
  if (userAnswer) {
      userAnswer.addEventListener("input", function() {
          // Auto-resize textarea height
          this.style.height = 'auto';
          this.style.height = (this.scrollHeight) + 'px';
      });

      userAnswer.addEventListener('keydown', function(event) {
          // Submit on Enter, new line on Shift+Enter
          if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault(); // Prevent default Enter behavior (new line)
              submitBtn?.click(); // Trigger click on submit button if it exists
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
  }
  // Ensure textarea border is correct on load
  toggleDarkMode(); // Call once to set initial state correctly based on class
  toggleDarkMode(); // Call again to revert to the loaded state (hacky but ensures style match)

}); // End of DOMContentLoaded

/****************************************************
 * 重置聊天状态
 ****************************************************/
function resetChatState() {
    isFirstSubmission = true;

    // CORRECTED: Check if button exists before setting textContent
    const submitButton = document.getElementById("submit-answer-btn");
    if (submitButton) {
        submitButton.textContent = "提交答案";
    }

    const messagesEl = document.getElementById("messages");
    if (messagesEl) {
        messagesEl.innerHTML = ""; // Clear messages
    }

    const userAnswer = document.getElementById("userAnswer");
    if (userAnswer) {
        userAnswer.value = ""; // Clear textarea
        userAnswer.style.height = 'auto'; // Reset height
        userAnswer.placeholder = "請輸入你的答案或想聊的話題…"; // Reset placeholder
    }
    removeThinkingMessage(); // Ensure no thinking message lingers
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

  // CORRECTED: Hide other sections safely
  const yearMenu = document.getElementById("gaokao-year-menu");
  if (yearMenu) yearMenu.style.display = "none";

  const questionSection = document.getElementById("gaokao-question");
  if (questionSection) questionSection.style.display = "none";

  const dialogueArea = document.getElementById("dialogue-input-area");
  if (dialogueArea) dialogueArea.style.display = "none";

  const actionsSection = document.getElementById("gaokao-actions");
  if (actionsSection) actionsSection.style.display = "none";

  resetChatState(); // Reset chat when changing views

  if (!Array.isArray(TYPES) || TYPES.length === 0) {
       console.error("TYPES data is invalid or empty.");
       menu.innerHTML = "<p>無法加載題型分類。</p>";
       menu.style.display = "block"; // Use block to show the paragraph error
       return;
   }

  console.log(`Creating ${TYPES.length} type buttons.`);
  TYPES.forEach(t => {
    const btn = document.createElement("button");
    btn.textContent = t.label;
    btn.onclick = () => { // Use arrow function for click handler
        console.log(`Type button "${t.label}" (${t.key}) clicked.`);
        showYearMenu(t.key);
    };
    menu.appendChild(btn);
  });

  menu.style.display = "flex"; // Show menu AFTER adding buttons
  console.log("#gaokao-type-menu display set to 'flex'. Menu should be visible.");

  // Scroll the type menu into view if needed
  menu.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/****************************************************
 * 显示该题型的年份菜单
 ****************************************************/
function showYearMenu(typeKey) {
  console.log(`Showing year menu for type: ${typeKey}`);

  const yearMenu = document.getElementById("gaokao-year-menu");
  if (!yearMenu) {
      console.error("#gaokao-year-menu not found!");
      return; // Exit if the menu element isn't found
  }

  // CORRECTED: Hide question/dialogue sections safely
  const questionSection = document.getElementById("gaokao-question");
  if (questionSection) questionSection.style.display = "none";

  const dialogueArea = document.getElementById("dialogue-input-area");
  if (dialogueArea) dialogueArea.style.display = "none";

  const actionsSection = document.getElementById("gaokao-actions");
  if (actionsSection) actionsSection.style.display = "none";

  resetChatState(); // Reset chat state when showing year menu

  const dataArr = allData.filter(item => item.key === typeKey);
  const typeLabel = TYPES.find(t => t.key === typeKey)?.label || typeKey;

  yearMenu.innerHTML = ""; // Clear previous year buttons

  if (dataArr.length === 0) {
    console.warn(`No data found for type: ${typeKey}`);
    // Display message inside the yearMenu element
    yearMenu.innerHTML = `<p style="text-align:center; width:100%; padding: 1rem;">暫無 ${typeLabel} 類型的題目數據。</p>`;
    yearMenu.style.display = "block"; // Use block to show the paragraph error
  } else {
    const years = [...new Set(dataArr.map(item => item.year))].sort((a, b) => b - a); // Sort descending
    console.log(`Creating buttons for years: ${years.join(', ')}`);
    years.forEach(year => {
      const btn = document.createElement("button");
      btn.textContent = `${year} 年`;
      btn.onclick = () => { // Use arrow function for click handler
          console.log(`Year button "${year}" clicked for type "${typeKey}".`);
          // Pass the already filtered data for that year
          showQuestionList(typeKey, year, dataArr.filter(item => item.year === year));
      };
      yearMenu.appendChild(btn);
    });
    yearMenu.style.display = "flex"; // Show the year menu using flex
  }

  console.log("#gaokao-year-menu display style set.");
  yearMenu.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/****************************************************
 * 显示该年份题目列表 (实际显示第一题)
 ****************************************************/
function showQuestionList(typeKey, year, questionsForYear) {
  console.log(`Showing question list for type: ${typeKey}, year: ${year}`);

  const questionSec = document.getElementById("gaokao-question");
  const dialogueInputArea = document.getElementById("dialogue-input-area");
  const actionsSec = document.getElementById("gaokao-actions");

  // Check if essential elements exist
  if (!questionSec || !dialogueInputArea || !actionsSec) {
      console.error("Missing required elements (question/dialogue/actions) for displaying question list.");
      // Optionally display an error message to the user
      if (questionSec) { // If question section exists, show error there
           questionSec.innerHTML = "<p style='color:red;'>頁面元件載入不完整，無法顯示題目列表。</p>";
           questionSec.style.display = "block";
      }
      return; // Stop execution if elements are missing
  }

  resetChatState(); // Reset chat state for the new question list view

  const typeLabel = TYPES.find(t => t.key === typeKey)?.label || typeKey;

  // Always set the title first
  questionSec.innerHTML = `<h2 style="font-size:1.5rem;">${year} 年北京真題 (${typeLabel})</h2>`;

  if (questionsForYear && questionsForYear.length > 0) {
    console.log(`Found ${questionsForYear.length} question(s). Displaying the first one.`);
    questionSec.style.display = "block"; // Ensure section is visible
    // Append the first question's details
    showQuestionDetail(questionsForYear[0]); // Display the first question
  } else {
    console.warn(`No questions found for type: ${typeKey}, year: ${year}.`);
    // Append message to the existing H2 title
    questionSec.innerHTML += `<p style="font-size:1.2rem; margin-top: 1rem;">${year} 年的 ${typeLabel} 題目暫無資料。</p>`;
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
    const questionSec = document.getElementById("gaokao-question");
    const dialogueInputArea = document.getElementById("dialogue-input-area");
    const actionsSec = document.getElementById("gaokao-actions");

    // Basic check for necessary elements
    if (!questionSec || !dialogueInputArea || !actionsSec) {
      console.error("Missing required elements (question/dialogue/actions) for displaying question detail.");
       // Attempt to show error in question section if it exists
       if(questionSec) {
            questionSec.innerHTML += "<p style='color:red;'>錯誤：頁面元件不完整，無法顯示題目詳情。</p>";
            questionSec.style.display = "block";
       }
       // Hide interaction areas on error
       if (dialogueInputArea) dialogueInputArea.style.display = "none";
       if (actionsSec) actionsSec.style.display = "none";
       return;
    }

    // Check if question data is valid
    if (!question || typeof question !== 'object') {
        console.error("Invalid question data passed to showQuestionDetail:", question);
        // Append error message to the existing H2 title (set in showQuestionList)
        questionSec.innerHTML += "<p style='color:red; margin-top: 1rem;'>錯誤：無法加載題目詳情，數據格式不正確。</p>";
        questionSec.style.display = "block"; // Ensure visible
        // Hide interaction areas on error
        dialogueInputArea.style.display = "none";
        actionsSec.style.display = "none";
        return;
    }

  console.log(`Showing details for question: ${question.year} ${question.key}`);
  currentQuestion = question; // Set the global current question
  // Don't reset chat here, reset happens in showQuestionList before calling this

  // Append formatted question content to the existing H2 title
  // The H2 is already set by showQuestionList
  const formattedHtml = formatQuestionHTML(question);
  // Append the rest of the question details
  const contentDiv = document.createElement('div');
  contentDiv.innerHTML = formattedHtml;
  questionSec.appendChild(contentDiv);


  questionSec.style.display = "block"; // Ensure it's visible

  // Show interaction areas
  dialogueInputArea.style.display = "block";
  actionsSec.style.display = "block";
  console.log("Question details, dialogue area, and actions displayed.");

  // Scroll the question section into view smoothly
  questionSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


/****************************************************
 * 格式化题目内容 HTML (for appending to H2)
 ****************************************************/
function formatQuestionHTML(q) {
    // This function generates the HTML string for materials, questions, prompts
    // It assumes the H2 title is already present in the target element
    if (!q || typeof q !== 'object') {
        console.error("Invalid question data in formatQuestionHTML:", q);
        return "<p style='color:red;'>錯誤：題目數據格式不正確。</p>";
    }

    let htmlContent = ''; // Build the HTML string for content

    // Helper to format text with proper line breaks using spans
    const formatTextWithNewlines = (text) => {
        if (!text || typeof text !== 'string') return '';
        // Trim each line and filter out empty lines after trimming
        return text.split('\n')
                   .map(line => line.trim())
                   .filter(line => line.length > 0)
                   // Wrap non-empty lines in spans
                   .map(line => `<span class="formatted-line">${line}</span>`)
                   // Join spans; CSS (.formatted-line { display: block; }) handles line breaks
                   .join('');
    };


    // Add materials if they exist, with spacing
    if (q.material1) htmlContent += `<div style="margin-top: 1em;"><strong>材料1：</strong>${formatTextWithNewlines(q.material1)}</div>`;
    if (q.material2) htmlContent += `<div style="margin-top: 1em;"><strong>材料2：</strong>${formatTextWithNewlines(q.material2)}</div>`;
    if (q.material3) htmlContent += `<div style="margin-top: 1em;"><strong>材料3：</strong>${formatTextWithNewlines(q.material3)}</div>`;

    // Add questions if they exist, with spacing
    let questionHtml = '';
    for (let i = 1; i <= 10; i++) { // Check up to 10 questions
        const questionKey = `question${i}`;
        if (q[questionKey]) {
            // Add spacing before each question paragraph
            questionHtml += `<p style="margin-top: 0.8em;"><strong>問題 ${i}：</strong>${formatTextWithNewlines(q[questionKey])}</p>`;
        }
    }
     if (questionHtml) {
        // Add a wrapper div for questions with top margin
        htmlContent += `<div style="margin-top: 1.2em;">${questionHtml}</div>`;
    }


    // Add prompts (for essays etc.) if they exist, with spacing
    if (q.prompts && Array.isArray(q.prompts) && q.prompts.length > 0) {
        // Add a wrapper div for prompts with title and top margin
        let promptHtml = '<div style="margin-top: 1.2em;"><strong>寫作要求：</strong>';
        q.prompts.forEach((p, idx) => {
            let promptText = '';
            if (p && typeof p === 'object' && p.prompt_text) {
                 promptText = formatTextWithNewlines(p.prompt_text);
            } else if (typeof p === 'string') { // Handle if prompts are just strings
                 promptText = formatTextWithNewlines(p);
            }
            if (promptText) {
                 // Add spacing for each prompt item
                 promptHtml += `<p style="margin-left: 1em; margin-top: 0.5em;">(${idx + 1}) ${promptText}</p>`;
            }
        });
        promptHtml += '</div>';
        htmlContent += promptHtml;
    }

    return htmlContent; // Return the generated HTML string
}


/****************************************************
 * 生成 AI prompt (Validated and Structured)
 ****************************************************/
function buildAIPrompt(q, mode, userAnswer = "") {
    if (!q || typeof q !== 'object') {
        console.error("Invalid question data in buildAIPrompt:", q);
        return "錯誤：題目數據無效。無法生成提示。"; // Return error string
    }

    const promptKey = q.key || 'default';
    let basePrompt = `${GAOKAO_PROMPTS[promptKey] || GAOKAO_PROMPTS.default}\n\n**題目背景：**\n`;
    basePrompt += `年份: ${q.year || '未知'}\n`;
    basePrompt += `題型: ${TYPES.find(t => t.key === q.key)?.label || q.key || '未知'}\n`;
    if (q.topic) basePrompt += `主題: ${q.topic}\n`;
    basePrompt += "------\n"; // Separator

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
             let text = '';
             if (p && typeof p === 'object' && p.prompt_text) text = p.prompt_text;
             else if (typeof p === 'string') text = p;
             if (text) basePrompt += `(${idx + 1}) ${text}\n`;
        });
        basePrompt += "\n";
    }

    basePrompt += "------\n"; // Separator before instructions/user input

    // Add specific instructions based on type for review/solve modes
    if (mode === "review" || mode === "solve") {
        if (q.key === "weixiezuo") {
            basePrompt += `**評分指令 (微寫作):**\n${MICRO_WRITING_INSTRUCTIONS}\n\n`;
        } else if (q.key === "dazuowen") {
            basePrompt += `**評分指令 (大作文):**\n${LONG_ESSAY_INSTRUCTIONS}\n\n`;
        }
    }

    // Add user answer and specific task based on mode
    if (mode === "review") {
        basePrompt += `**學生答案：**\n${userAnswer || "(學生未提供答案)"}\n\n`;
        if (q.reference_answer) {
            basePrompt += `**參考答案 (僅供AI內部參考)：**\n${q.reference_answer}\n\n`;
        }
        basePrompt += `**AI任務：** 請嚴格按照前面的 '評分指令'（如果適用），評估學生的答案。指出優缺點，提供改進建議，並給出分數/等級（如果適用）。如果沒有評分指令，請分析學生答案的合理性、完整性和準確性。`;

    } else if (mode === "solve") {
         if (userAnswer) {
             basePrompt += `**學生之前的嘗試（僅供AI參考）：**\n${userAnswer}\n\n`;
         }
         basePrompt += `**AI任務：** 請直接回答或完成此題目。請用友善、清晰的學長姐語氣作答。如果是寫作題，請直接按要求寫一篇範文。`;

    } else { // Default mode assumed to be 'chat'
        basePrompt += `**用戶最新輸入：**\n"${userAnswer}"\n\n`;
        basePrompt += `**AI任務：** 這是接著之前的對話。請基於整個對話上下文（包括題目、之前的回答和學生這次的輸入），以適當的角色（學長姐/閱卷官/助手）進行自然的回應、討論或回答用戶的最新輸入。`;
    }

    basePrompt += "\n\n**風格要求：** 請務必使用 **繁體中文** 回答。";
    return basePrompt;
}


/****************************************************
 * 呼叫 AI 並處理回复 (Async/Await, Error Handling)
 ****************************************************/
async function callAI(prompt) {
    if (typeof prompt !== 'string' || !prompt.trim()) {
        console.error("Invalid prompt passed to callAI:", prompt);
        addMessage("內部錯誤：無法向 AI 發送有效請求。", "ai");
        return;
    }

    removeThinkingMessage(); // Remove any previous thinking message
    thinkingMessageElement = addMessage("<em class='thinking-message'>AI 正在運轉思緒中... 請稍候 🤖 ...</em>", "ai");


    try {
        const response = await fetch(CLOUD_FLARE_WORKER_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json" // Indicate we expect JSON back
            },
            body: JSON.stringify({ prompt: prompt })
        });

        removeThinkingMessage(); // Remove thinking message once response received

        if (!response.ok) {
            // Try to get more specific error from response body
            let errorDetail = `HTTP ${response.status} ${response.statusText}`;
            try {
                const errorBody = await response.text(); // Read response text
                // Attempt to parse as JSON for structured error, otherwise use text
                 try {
                    const errorJson = JSON.parse(errorBody);
                    errorDetail = errorJson.error || errorJson.message || errorBody.substring(0,150);
                 } catch {
                    errorDetail = errorBody.substring(0, 150); // Use raw text if not JSON
                 }

            } catch (e) { /* Ignore if reading body fails */ }
            throw new Error(`請求 AI 服務失敗: ${errorDetail}`);
        }

        const json = await response.json(); // Parse the JSON body

        if (json && json.answer) {
            // Format and display the AI's answer
            addMessage(formatAnswer(json.answer), "ai");
        } else {
             // Handle cases where response is OK but answer is missing/empty
             console.error("AI response OK but missing 'answer' field:", json);
             throw new Error("AI 回應成功，但內容格式不正確或為空。");
        }

    } catch (err) {
        console.error("AI request/processing error:", err);
        removeThinkingMessage(); // Ensure thinking message is removed on any error
        // Display a user-friendly error in the chat
        addMessage(`糟糕！與 AI 連接時遇到問題。<br><small>錯誤： ${err.message || "請檢查網路連線或稍後再試。"}</small>`, "ai");
    }
}


/****************************************************
 * 参考答案显示
 ****************************************************/
function showReferenceAnswer() {
  if (!currentQuestion) {
    addMessage("請先選擇一道題目，才能查看參考答案哦。", "ai");
    return;
  }
  removeThinkingMessage(); // Clear thinking message if any

  if (currentQuestion.reference_answer) {
    // Format the reference answer for better readability
    addMessage(`<strong>參考答案：</strong><br/>${formatAnswer(currentQuestion.reference_answer)}`, "ai");
  } else {
    addMessage("抱歉，這道題目的參考答案還沒有收錄呢。", "ai");
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
      console.error("#userAnswer element not found. Cannot submit.");
      return;
  }

  const answer = userAnswerEl.value.trim();

  if (!answer) {
    addMessage("您好像忘了輸入內容？寫點什麼吧！✍️", "ai");
    // Visual feedback
    userAnswerEl.style.outline = '2px solid orange';
    userAnswerEl.focus();
    setTimeout(() => { userAnswerEl.style.outline = 'none'; }, 1000);
    return;
  }

  // Display user's message immediately
  addMessage(formatAnswer(answer), "user"); // Format user input for consistency

  // Clear the input textarea and reset its height
  userAnswerEl.value = "";
  userAnswerEl.style.height = 'auto';
  // Consider removing focus to allow easier scrolling/reading of AI response
  // userAnswerEl.focus();

  const submitButton = document.getElementById("submit-answer-btn");
  let prompt = "";
  let mode = "chat"; // Default to chat mode

  if (isFirstSubmission) {
    console.log("First submission for this question. Determining mode...");
    // Use "review" mode for the first submission if it's a writing task or has a reference answer
    const isWriting = currentQuestion.key === 'weixiezuo' || currentQuestion.key === 'dazuowen';
    // Even non-writing might benefit from review/analysis initially
    mode = "review";
    console.log(`Mode set to: ${mode}`);
    prompt = buildAIPrompt(currentQuestion, mode, answer);

    isFirstSubmission = false; // Mark first submission as done
    if (submitButton) {
        submitButton.textContent = "深度聊天"; // Change button text for follow-ups
    }
  } else {
    console.log("Follow-up submission (chat mode).");
    // Subsequent submissions are treated as chat/follow-up
    mode = "chat"; // Explicitly 'chat' mode
    prompt = buildAIPrompt(currentQuestion, mode, answer);
  }

  // Call the AI
  callAI(prompt);
}

/****************************************************
 * 请求 AI 直接生成答案
 ****************************************************/
function askAIForSolution() {
  if (!currentQuestion) {
    addMessage("要先選好題目，我才能幫您生成 AI 答案呀！", "ai");
    return;
  }

  // Give user feedback that the request is processing
  addMessage("收到請求！正在召喚 AI 來解答這道題目...", "ai");

  // Get user's current input (if any) to pass as context, though AI's task is to solve anew
  const userAnswerEl = document.getElementById("userAnswer");
  const currentInput = userAnswerEl ? userAnswerEl.value.trim() : "";

  // Build prompt in "solve" mode
  const prompt = buildAIPrompt(currentQuestion, "solve", currentInput);
  callAI(prompt);

  // If this was the first interaction, update the submit button state
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
      localStorage.setItem("darkMode", "disabled"); // Use "disabled"
      console.log("Dark mode disabled and saved.");
  }
   // Update textarea border color immediately to match mode
    const userAnswer = document.getElementById("userAnswer");
    if(userAnswer) {
         // Get the border color from CSS variables or computed style if possible,
         // otherwise use the hardcoded values from your CSS.
         const computedStyle = getComputedStyle(document.body);
         // Example: Assuming CSS variables are set like --textarea-border-light and --textarea-border-dark
         // userAnswer.style.borderColor = isDarkMode ? computedStyle.getPropertyValue('--textarea-border-dark') : computedStyle.getPropertyValue('--textarea-border-light');
         // Using hardcoded values from your CSS as a fallback:
         userAnswer.style.borderColor = isDarkMode ? '#555' : '#ccc';
    }

    // Update toggle button icon (optional)
    const toggleBtn = document.getElementById("toggle-dark-btn");
    if (toggleBtn) {
        toggleBtn.textContent = isDarkMode ? '☀️' : '🌗'; // Sun for dark mode, Moon for light mode
        toggleBtn.title = isDarkMode ? '切換日間模式' : '切換夜晚模式';
    }
}

// --- End of app.js ---