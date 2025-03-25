/****************************************************
 * 配置 & 全局變數
 ****************************************************/
const CLOUD_FLARE_WORKER_URL = "https://gaokao.bdfz.workers.dev/";

let currentQuestion = null;  // 用於存放目前選中的題目資料
let allData = [];            // 存放當前類型題目的全部數據

// 各類型設定：key, label, dataFile 或 external 連結
const TYPES = [
  { key: "feilian", label: "非連文本", dataFile: "feilian.json" },
  { key: "guwen", label: "古文", dataFile: "guwen.json" },
  { key: "shici", label: "詩詞", dataFile: "shici.json" },
  { key: "lunyu", label: "論語", external: "https://kz.bdfz.net/" },
  { key: "moxie", label: "默寫", external: "https://mf.bdfz.net/" },
  { key: "honglou", label: "紅樓夢", external: "https://hlm.bdfz.net/" },
  { key: "sanwen", label: "散文", dataFile: "sanwen.json" },
  { key: "yuyanjichu", label: "語言基礎運用", dataFile: "yuyanjichu.json" },
  { key: "weixiezuo", label: "微寫作", dataFile: "weixiezuo.json" },
  { key: "dazuowen", label: "大作文", dataFile: "dazuowen.json" }
];

// 全局 AI prompt 前綴設定
const GAOKAO_PROMPTS = {
  feilian: "這是一道非連文本題，請依據下列材料回答：",
  guwen: "這是一道古文題，請依據原文和注釋回答：",
  shici: "這是一道詩詞題，請根據詩詞進行解析：",
  default: "這是一道高考題，請解題："
};

/****************************************************
 * 輔助函式：格式化文字
 ****************************************************/
function formatAnswer(text) {
  return text.split('\n').map(line => `<p>${line.trim()}</p>`).join('');
}

/****************************************************
 * 輔助函式：顯示訊息（包含隨機小動物 emoji 分隔符）
 * 對話內容將依序由上而下排列（即先前的在上，後續消息追加在下）
 ****************************************************/
function addMessage(message, sender = "system") {
  const messagesEl = document.getElementById("messages");
  if (!messagesEl) return;
  // 如果已有訊息，加入隨機小動物作為分隔符
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
 * 項目初始化：綁定按鈕事件與自動調整 textarea 高度
 ****************************************************/
document.addEventListener("DOMContentLoaded", () => {
  // 一載入頁面就顯示二級目錄
  showTypeMenu();
  console.log("showTypeMenu triggered", TYPES);

  // 綁定底部互動按鈕
  document.getElementById("submit-answer-btn").addEventListener("click", submitAnswer);
  document.getElementById("reference-answer-btn").addEventListener("click", showReferenceAnswer);
  document.getElementById("ai-answer-btn").addEventListener("click", askAIForSolution);
  
  // 綁定夜晚模式切換按鈕
  const toggleDarkBtn = document.getElementById("toggle-dark-btn");
  if (toggleDarkBtn) {
    toggleDarkBtn.addEventListener("click", toggleDarkMode);
  }
  
  // 自動調整答案輸入區高度
  const userAnswer = document.getElementById("userAnswer");
  userAnswer.addEventListener("input", function() {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
  });
});

/****************************************************
 * 1) 顯示二級目錄（題型按鈕）
 ****************************************************/
function showTypeMenu() {
  const menu = document.getElementById("gaokao-type-menu");
  menu.style.display = "block";
  menu.innerHTML = "";
  // 清除其他內容
  document.getElementById("gaokao-year-menu").innerHTML = "";
  document.getElementById("gaokao-question").innerHTML = "";
  document.getElementById("messages").innerHTML = "";
  document.getElementById("gaokao-actions").style.display = "none";

  TYPES.forEach(t => {
    const btn = document.createElement("button");
    btn.textContent = t.label;  // 這裡會顯示「非連文本、古文、詩詞…默寫…大作文」等文字
    btn.style.fontSize = "1.0rem";
    btn.style.padding = "0.8rem 1rem";
    btn.onclick = () => {
      if (t.external) {
        window.open(t.external, "_blank");
      } else if (!t.dataFile) {
        alert("製作中，慢慢等");
      } else {
        fetch(`data/${t.dataFile}`)
          .then(res => res.json())
          .then(json => showYearMenu(t.key, json))
          .catch(err => {
            console.error("讀取 " + t.dataFile + " 錯誤:", err);
            alert("製作中，慢慢等");
          });
      }
    };
    menu.appendChild(btn);
  });
}

/****************************************************
 * 2) 顯示三級目錄：年份列表（居中顯示）
 ****************************************************/
function showYearMenu(typeKey, dataArr) {
  // 清除先前題目和對話內容
  document.getElementById("gaokao-question").innerHTML = "";
  document.getElementById("messages").innerHTML = "";
  document.getElementById("gaokao-actions").style.display = "none";
  const yearMenu = document.getElementById("gaokao-year-menu");
  yearMenu.style.display = "block";
  yearMenu.innerHTML = "";
  // 年份按鈕縮小
  const years = [...new Set(dataArr.map(item => item.year))].sort((a, b) => b - a);
  years.forEach(y => {
    const btn = document.createElement("button");
    btn.textContent = y + " 年";
    btn.style.fontSize = "0.7rem";
    btn.style.padding = "0.8rem 1rem";
    btn.onclick = () => {
      showQuestionList(typeKey, y, dataArr);
    };
    yearMenu.appendChild(btn);
  });
}

/****************************************************
 * 3) 顯示該年份題目列表（第四級目錄）
 ****************************************************/
function showQuestionList(typeKey, year, dataArr) {
  const questionSec = document.getElementById("gaokao-question");
  questionSec.style.display = "block";
  // 標題改為「背景真題」，正文字號縮小兩號
  questionSec.innerHTML = `<h2 style="font-size:1.5rem;">${year} 年背景真題</h2>`;
  const questions = dataArr.filter(q => q.year == year);
  if (questions.length > 1) {
    questions.forEach((q, idx) => {
      const btn = document.createElement("button");
      btn.textContent = (q.topic || "題目") + " #" + (idx + 1);
      btn.style.fontSize = "1.0rem";
      btn.style.padding = "0.8rem 1rem";
      btn.onclick = () => showQuestionDetail(typeKey, q);
      questionSec.appendChild(btn);
    });
  } else if (questions.length === 1) {
    showQuestionDetail(typeKey, questions[0]);
  } else {
    questionSec.innerHTML += `<p style="font-size:1.5rem;">該年份暫無資料，製作中，慢慢等</p>`;
  }
}

/****************************************************
 * 4) 顯示選中的題目內容
 ****************************************************/
function showQuestionDetail(typeKey, q) {
  currentQuestion = q;
  // 清除之前對話消息
  document.getElementById("messages").innerHTML = "";
  const questionSec = document.getElementById("gaokao-question");
  questionSec.innerHTML = formatQuestionHTML(typeKey, q);
  // 顯示底部互動按鈕區
  document.getElementById("gaokao-actions").style.display = "block";
  // 展開對話窗口
  document.getElementById("dialogue-box").style.display = "block";
}

/****************************************************
 * 4.1) 將題目資料格式化為 HTML
 ****************************************************/
function formatQuestionHTML(typeKey, q) {
  let html = `<h2 style="font-size:1.5rem;">${q.year}年 ${q.topic || ""}</h2>`;
  if (q.material1) html += `<p><strong>材料1：</strong>${q.material1}</p>`;
  if (q.material2) html += `<p><strong>材料2：</strong>${q.material2}</p>`;
  if (q.original_text) html += `<p><strong>原文：</strong>${q.original_text}</p>`;
  if (q.annotation) html += `<p><strong>注釋：</strong>${q.annotation}</p>`;
  if (q.poem_text) html += `<p><strong>詩文：</strong>${q.poem_text}</p>`;
  for (let i = 1; i <= 5; i++) {
    if (q["question" + i]) {
      html += `<p><strong>問題${i}：</strong>${q["question" + i]}</p>`;
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
 * 5) 底部互動按鈕功能
 * 提交答案、參考答案、AI答案點擊後展開對話窗口
 ****************************************************/
function submitAnswer() {
  if (!currentQuestion) {
    alert("尚未選擇任何題目");
    return;
  }
  const answer = document.getElementById("userAnswer").value.trim();
  if (!answer) {
    alert("請輸入答案");
    return;
  }
  // 展開對話窗口
  document.getElementById("dialogue-box").style.display = "block";
  // 顯示用戶輸入的答案
  addMessage("用戶答案：" + answer, "user");
  
  // 根據是否有參考答案，選擇 review 或 solve 模式
  if (currentQuestion.reference_answer) {
    const prompt = buildAIPrompt(currentQuestion, "review", answer);
    callAI(prompt);
  } else {
    const prompt = buildAIPrompt(currentQuestion, "solve", answer);
    callAI(prompt);
  }
  // 更新輸入框 placeholder 為固定文字
  document.getElementById("userAnswer").placeholder = `請輸入答案`;
  document.getElementById("userAnswer").value = "";
}

function showReferenceAnswer() {
  if (!currentQuestion) {
    alert("尚未選擇任何題目");
    return;
  }
  if (currentQuestion.reference_answer) {
    addMessage("<strong>參考答案：</strong><br/>" + currentQuestion.reference_answer, "system");
  } else {
    const prompt = buildAIPrompt(currentQuestion, "solve");
    callAI(prompt);
  }
  document.getElementById("dialogue-box").style.display = "block";
}

function askAIForSolution() {
  if (!currentQuestion) {
    alert("尚未選擇任何題目");
    return;
  }
  const prompt = buildAIPrompt(currentQuestion, "solve");
  callAI(prompt);
  document.getElementById("dialogue-box").style.display = "block";
}

/****************************************************
 * 6) 建立 AI prompt（mode: "review" 或 "solve"）
 * 讀取對話歷史以保持連續的對話流
 ****************************************************/
function buildAIPrompt(q, mode, userAnswer = "") {
  // 讀取對話歷史
  let conversationHistory = "";
  const messagesEl = document.getElementById("messages");
  if (messagesEl) {
    conversationHistory = Array.from(messagesEl.children).map(el => el.textContent).join("\n");
  }
  let typeKey = guessTypeFromQuestion(q);
  let prefix = GAOKAO_PROMPTS[typeKey] || GAOKAO_PROMPTS.default;
  let base = `${prefix}\n題目信息：\n`;
  if (q.material1) base += `材料1：${q.material1}\n`;
  if (q.material2) base += `材料2：${q.material2}\n`;
  if (q.original_text) base += `原文：${q.original_text}\n`;
  if (q.annotation) base += `注釋：${q.annotation}\n`;
  if (q.poem_text) base += `詩文：${q.poem_text}\n`;
  for (let i = 1; i <= 5; i++) {
    if (q["question" + i]) {
      base += `問題${i}：${q["question" + i]}\n`;
    }
  }
  if (q.prompts) {
    q.prompts.forEach((p, idx) => {
      base += `作文提示${idx + 1}：${p.prompt_text}\n`;
    });
  }
  // 加入對話歷史
  base += `\n對話記錄：\n${conversationHistory}\n`;
  if (mode === "review") {
    base += `\n用戶答案：${userAnswer}\n參考答案：${q.reference_answer}\n請評價並給出建議。\n`;
  } else {
    base += `\n用戶答案：${userAnswer}\n請直接完成作答。\n`;
  }
  return base;
}

/****************************************************
 * 7) 輔助函式：猜測題型
 ****************************************************/
function guessTypeFromQuestion(q) {
  if (q.material1 && q.material2) return "feilian";
  if (q.original_text) return "guwen";
  if (q.poem_text) return "shici";
  return "feilian";
}

/****************************************************
 * 8) 呼叫 AI 並處理回覆
 ****************************************************/
function callAI(prompt) {
  addMessage("<em>AI 正在思考...</em>", "system");
  fetch(CLOUD_FLARE_WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: prompt })
  })
    .then(res => res.json())
    .then(json => {
      addMessage("AI：" + formatAnswer(json.answer), "system");
    })
    .catch(err => {
      console.error("AI 請求失敗", err);
      addMessage("製作中，慢慢等", "system");
    });
}

/****************************************************
 * 9) 夜晚模式切換
 ****************************************************/
function toggleDarkMode() {
  document.body.classList.toggle("dark-mode");
}