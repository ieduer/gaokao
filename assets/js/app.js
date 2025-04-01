/****************************************************
 * 配置 & 全局变量
 ****************************************************/
const CLOUD_FLARE_WORKER_URL = "https://apis.bdfz.workers.dev/"; // Replace with your actual worker URL if different

let currentQuestion = null; // Holds the currently displayed question object
let allData = []; // Holds all loaded question data from all.json
let isFirstSubmission = true; // Tracks if the current interaction with a question is the first submission
let thinkingMessageElement = null; // Holds the DOM element for the "AI is thinking" message

// Defines the types of questions and their labels
const TYPES = [
  { key: "feilian", label: "非连文本" }, { key: "guwen", label: "古文" },
  { key: "shici", label: "诗词" }, { key: "lunyu", label: "论语" },
  { key: "moxie", label: "默写" }, { key: "honglou", label: "红楼梦" },
  { key: "sanwen", label: "散文" }, { key: "yuyanjichu", label: "语言基础运用" },
  { key: "weixiezuo", label: "微写作" }, { key: "dazuowen", label: "大作文" }
];

// --- Prompts for different question types ---
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

  return div; // Return the newly created message element
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

  const toggleBtn = document.getElementById("toggle-dark-btn");
  if (toggleBtn) toggleBtn.addEventListener("click", toggleDarkMode);
  else console.warn("#toggle-dark-btn not found.");

  // --- Setup Textarea ---
  const userAnswer = document.getElementById("userAnswer");
  if (userAnswer) {
      // Auto-resize functionality
      userAnswer.addEventListener("input", function() {
          this.style.height = 'auto'; // Reset height
          this.style.height = (this.scrollHeight) + 'px'; // Set to scroll height
      });
      // Submit on Enter key (if Shift key is not pressed)
      userAnswer.addEventListener('keydown', function(event) {
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
        return; // Cannot proceed without the menu container
    }

    // Clear existing buttons before populating (ensures fresh state)
    menu.innerHTML = "";

    // Hide subsequent sections (Year Menu, Question, Dialogue, Actions)
    // Use safe access: find the element, then set style if found.
    const yearMenu = document.getElementById("gaokao-year-menu");
    if (yearMenu) yearMenu.style.display = "none";

    const questionSection = document.getElementById("gaokao-question");
    if (questionSection) questionSection.style.display = "none";

    const dialogueArea = document.getElementById("dialogue-input-area");
    if (dialogueArea) dialogueArea.style.display = "none";

    const actionsSection = document.getElementById("gaokao-actions");
    if (actionsSection) actionsSection.style.display = "none";

    // Reset chat state when returning to the main type menu? Optional, decide based on UX preference.
    // resetChatState();

    // Check if question data is loaded
    if (!allData || allData.length === 0) {
        console.error("Question data (allData) is not available. Cannot populate type menu.");
        // Display error only if a data loading error wasn't already shown
        if (!document.getElementById('data-load-error')) {
           menu.innerHTML = "<p style='text-align: center; padding: 1rem;'>題型數據加載失敗或為空。</p>";
           menu.style.display = "block"; // Show error message using block display
        } else {
            menu.style.display = "none"; // Hide menu area if fetch error shown
        }
        return;
    }

    // Check if the TYPES configuration is valid
    if (!Array.isArray(TYPES) || TYPES.length === 0) {
         console.error("TYPES constant configuration is invalid or empty.");
         menu.innerHTML = "<p style='text-align: center; padding: 1rem;'>無法加載題型分類配置。</p>";
         menu.style.display = "block";
         return;
     }

    console.log(`Populating type menu with up to ${TYPES.length} types.`);
    let typesAdded = 0;
    TYPES.forEach(t => {
        // Optimization: Only add a button if there's at least one question of this type in the data
        if (allData.some(item => item.key === t.key)) {
            const btn = document.createElement("button");
            btn.textContent = t.label; // Set button text
            btn.onclick = () => { // Assign click handler
                console.log(`Type button "${t.label}" (key: ${t.key}) clicked.`);
                showYearMenu(t.key); // Show years for the selected type
            };
            menu.appendChild(btn); // Add button to the menu
            typesAdded++;
        } else {
            // Log types that are configured but have no data
            console.log(`Skipping button for type "${t.label}" (key: ${t.key}) - no matching data found.`);
        }
    });

    if (typesAdded > 0) {
        menu.style.display = "flex"; // Show the menu using flex display (allows wrapping)
        console.log(`${typesAdded} type buttons added and menu displayed.`);
    } else {
        console.warn("No type buttons were added, possibly due to no matching data for configured types.");
        menu.innerHTML = "<p style='text-align: center; padding: 1rem;'>暫無可用題型數據。</p>";
        menu.style.display = "block"; // Show message if no buttons generated
    }

    // Optional: Scroll to the menu, e.g., if triggered by button click after scrolling down
    // menu.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


/****************************************************
 * 显示特定题型的年份菜单
 ****************************************************/
function showYearMenu(typeKey) {
  console.log(`Showing year menu for type: ${typeKey}`);

  const yearMenu = document.getElementById("gaokao-year-menu");
  if (!yearMenu) {
      console.error("#gaokao-year-menu element not found!");
      return; // Stop if element missing
  }

  // Hide other content sections safely
  const questionSection = document.getElementById("gaokao-question");
  if (questionSection) questionSection.style.display = "none";
  const dialogueArea = document.getElementById("dialogue-input-area");
  if (dialogueArea) dialogueArea.style.display = "none";
  const actionsSection = document.getElementById("gaokao-actions");
  if (actionsSection) actionsSection.style.display = "none";
  // Optionally hide the type menu as well? Or keep it visible above? Keep visible for now.
  // const typeMenu = document.getElementById("gaokao-type-menu");
  // if (typeMenu) typeMenu.style.display = "none";


  resetChatState(); // Reset chat when navigating to a new year list

  // Filter data for the selected type
  const dataForType = allData.filter(item => item.key === typeKey);
  // Get the display label for the type
  const typeLabel = TYPES.find(t => t.key === typeKey)?.label || typeKey; // Fallback to key if label not found

  yearMenu.innerHTML = ""; // Clear previous year buttons

  if (dataForType.length === 0) {
    // Handle case where no data exists for this type (should be caught by populateAndShowTypeMenu check, but be defensive)
    console.warn(`No data found for type key: ${typeKey}`);
    yearMenu.innerHTML = `<p style="text-align:center; width:100%; padding: 1rem;">暫無 ${typeLabel} 類型的題目數據。</p>`;
    yearMenu.style.display = "block"; // Show the message using block display
  } else {
    // Get unique years, sort them descending (most recent first)
    const years = [...new Set(dataForType.map(item => item.year))].sort((a, b) => b - a);
    console.log(`Found data for years: ${years.join(', ')} for type ${typeKey}. Creating buttons.`);

    // Create a button for each year
    years.forEach(year => {
      const btn = document.createElement("button");
      btn.textContent = `${year} 年`; // Set button text
      btn.onclick = () => { // Assign click handler
          console.log(`Year button "${year}" clicked for type "${typeKey}".`);
          // Filter data again specifically for this year and type to pass to the next step
          const questionsForYear = dataForType.filter(item => item.year === year);
          showQuestionList(typeKey, year, questionsForYear); // Show list for this year/type
      };
      yearMenu.appendChild(btn); // Add button to the year menu
    });
    yearMenu.style.display = "flex"; // Show the year menu using flex display (allows wrapping)
  }

  console.log("#gaokao-year-menu populated and display style set.");
  // Scroll the year menu into view smoothly
  yearMenu.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


/****************************************************
 * 显示特定年份和题型的题目列表 (实际显示第一题)
 ****************************************************/
function showQuestionList(typeKey, year, questionsForYear) {
  console.log(`Attempting to show question list for type: ${typeKey}, year: ${year}`);

  // Get references to the required DOM elements
  const questionSec = document.getElementById("gaokao-question");
  const dialogueInputArea = document.getElementById("dialogue-input-area");
  const actionsSec = document.getElementById("gaokao-actions");

  // Validate that essential elements exist
  if (!questionSec || !dialogueInputArea || !actionsSec) {
      console.error("Cannot display question list: Missing required elements (questionSec, dialogueInputArea, or actionsSec).");
      // Provide feedback if possible
      if (questionSec) {
           questionSec.innerHTML = "<p style='color:red;'>頁面錯誤：無法顯示題目列表，缺少必要元件。</p>";
           questionSec.style.display = "block";
      }
      return; // Stop execution
  }

  resetChatState(); // Reset chat state when showing a new question list/first question

  // Get the display label for the type
  const typeLabel = TYPES.find(t => t.key === typeKey)?.label || typeKey;

  // Set the main title for the question section
  questionSec.innerHTML = `<h2 style="font-size:1.5rem; margin-bottom: 1rem;">${year} 年北京真題 (${typeLabel})</h2>`; // Added margin-bottom to H2

  // Check if there are questions to display for this year/type
  if (questionsForYear && questionsForYear.length > 0) {
    console.log(`Found ${questionsForYear.length} question(s) for ${year} ${typeLabel}. Displaying the first.`);
    questionSec.style.display = "block"; // Make sure the section is visible

    // Call function to display the details of the first question found
    // This function will append the question content after the H2 title
    showQuestionDetail(questionsForYear[0]);

    // Show the interaction areas (dialogue, actions) as a question is displayed
    dialogueInputArea.style.display = "block";
    actionsSec.style.display = "block";

  } else {
    // Handle case where the filtered list for the year is unexpectedly empty
    console.warn(`No questions found in the provided list for type: ${typeKey}, year: ${year}.`);
    // Append a message indicating no data for this specific year/type
    questionSec.innerHTML += `<p style="font-size:1.2rem; margin-top: 1rem;">抱歉，${year} 年的 ${typeLabel} 題目暫未收錄。</p>`;
    questionSec.style.display = "block"; // Ensure section is visible to show the message

    // Hide interaction areas as there is no question displayed
    dialogueInputArea.style.display = "none";
    actionsSec.style.display = "none";
  }
}


/****************************************************
 * 显示选定题目的详细内容 (追加到 #gaokao-question)
 ****************************************************/
function showQuestionDetail(question) {
    // Get references to essential elements
    const questionSec = document.getElementById("gaokao-question");
    const dialogueInputArea = document.getElementById("dialogue-input-area");
    const actionsSec = document.getElementById("gaokao-actions");

    // Validate elements needed for display
    if (!questionSec || !dialogueInputArea || !actionsSec) {
      console.error("Cannot display question detail: Missing required elements (questionSec, dialogueInputArea, or actionsSec).");
       if(questionSec) { // Show error in question section if possible
            questionSec.innerHTML += "<p style='color:red; margin-top: 1rem;'>頁面錯誤：無法顯示題目詳情。</p>";
            questionSec.style.display = "block"; // Make sure error is visible
       }
       // Hide interaction if elements are missing
       if (dialogueInputArea) dialogueInputArea.style.display = "none";
       if (actionsSec) actionsSec.style.display = "none";
       return;
    }

    // Validate the question data object
    if (!question || typeof question !== 'object') {
        console.error("Invalid question data provided to showQuestionDetail:", question);
        // Append error message after the H2 title (already set by showQuestionList)
        questionSec.innerHTML += "<p style='color:red; margin-top: 1rem;'>錯誤：題目數據格式不正確，無法顯示詳情。</p>";
        questionSec.style.display = "block"; // Ensure visible
        // Hide interaction areas due to invalid data
        dialogueInputArea.style.display = "none";
        actionsSec.style.display = "none";
        return;
    }

    console.log(`Displaying details for question: ${question.year} ${question.key} (ID/Topic: ${question.topic || question.id || 'N/A'})`);
    currentQuestion = question; // Update the global reference to the currently active question
    // NOTE: resetChatState is called in showQuestionList *before* this function

    // Format the question content (materials, questions, prompts) into HTML
    const formattedHtmlContent = formatQuestionHTML(question);

    // Create a temporary div to parse the HTML string and append its children
    // This avoids wiping out the H2 title with innerHTML assignment
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = formattedHtmlContent;

    // Append the formatted content nodes to the question section (after the H2)
    while (tempDiv.firstChild) {
        questionSec.appendChild(tempDiv.firstChild);
    }

    questionSec.style.display = "block"; // Ensure the question section is visible

    // Interaction areas should have been made visible by showQuestionList, but ensure here too
    dialogueInputArea.style.display = "block";
    actionsSec.style.display = "block";
    console.log("Question details appended. Dialogue and actions areas should be visible.");

    // Scroll the beginning of the question section into view
    questionSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


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
        htmlContent += `<div class="question-block" style="margin-top: 1.2em;">${questionHtml}</div>`;
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
                 } catch {
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
        // Display a user-friendly error message in the chat interface
        addMessage(`哎呀，與 Gemini 的連接似乎出了點問題... <br><small>錯誤信息：${err.message || "未知的網路或伺服器錯誤"}</small>`, "ai");
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

    // Determine the mode ('review' for first submission, 'chat' otherwise) and build the prompt
    const submitButton = document.getElementById("submit-answer-btn");
    let prompt = "";
    let mode = "chat"; // Default to chat mode for subsequent interactions

    if (isFirstSubmission) {
        console.log("Processing first submission for this question. Mode: review.");
        mode = "review"; // Treat the first submission as needing review/analysis
        prompt = buildAIPrompt(currentQuestion, mode, answerText);

        // Update state: no longer the first submission for this question
        isFirstSubmission = false;
        // Change the submit button text to reflect chat mode
        if (submitButton) {
            submitButton.textContent = "深度聊天";
        }
    } else {
        console.log("Processing follow-up submission. Mode: chat.");
        mode = "chat"; // Explicitly set mode to chat
        prompt = buildAIPrompt(currentQuestion, mode, answerText);
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

    // Provide immediate feedback to the user
    addMessage("好的，已收到您的請求！正在讓 Gemini 思考這道題目的答案...", "ai");

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
        toggleBtn.textContent = isDarkMode ? '☀️' : '🌗'; // Sun icon for dark mode, Moon for light
        toggleBtn.title = isDarkMode ? '切換日間模式' : '切換夜晚模式'; // Update tooltip
    }
}

// Helper function to update the textarea's border color based on the mode
function updateTextareaBorder(isDarkMode) {
     const userAnswer = document.getElementById("userAnswer");
     if(userAnswer) {
         // Use the border colors defined in the CSS for consistency
         userAnswer.style.borderColor = isDarkMode ? '#555' : '#ccc';
     }
}

// --- End of app.js ---