/****************************************************
 * 配置 & 全局變數
 ****************************************************/
const CLOUD_FLARE_WORKER_URL = "https://gaokao.bdfz.workers.dev/";

let currentQuestion = null;  // 用於存放目前選中的題目資料
let allData = [];            // 存放當前類型題目的全部數據

// 各類型設定（key, label, dataFile, 外部鏈接等）
const TYPES = [
  { key: "feilian", label: "非連文本", dataFile: "feilian.json" },
  { key: "guwen", label: "古文", dataFile: "guwen.json" },
  { key: "shici", label: "詩詞", dataFile: "shici.json" },
  { key: "lunyu", label: "論語", external: "https://kz.bdfz.net/" },
  { key: "honglou", label: "紅樓夢", external: "https://hlm.bdfz.net/" },
  { key: "sanwen", label: "散文", dataFile: "sanwen.json" },
  { key: "yuyanjichu", label: "語言基礎運用", dataFile: "yuyanjichu.json" },
  { key: "weixiezuo", label: "微寫作", dataFile: "weixiezuo.json" },
  { key: "dazuowen", label: "大作文", dataFile: "dazuowen.json" }
];

/****************************************************
 * 項目初始化：綁定按鈕事件
 ****************************************************/
document.addEventListener("DOMContentLoaded", () => {
  const gaokaoBtn = document.getElementById("gaokao-btn");
  if (gaokaoBtn) {
    gaokaoBtn.addEventListener("click", showTypeMenu);
  }

  // 底部互動按鈕
  document.getElementById("submit-answer-btn").addEventListener("click", submitAnswer);
  document.getElementById("reference-answer-btn").addEventListener("click", showReferenceAnswer);
  document.getElementById("ai-answer-btn").addEventListener("click", askAIForSolution);
  // 對話框送出
  document.getElementById("sendUserInputBtn").addEventListener("click", sendUserInput);

  // 夜晚模式切換
  const toggleDarkBtn = document.getElementById("toggle-dark-btn");
  if (toggleDarkBtn) {
    toggleDarkBtn.addEventListener("click", toggleDarkMode);
  }
});

/****************************************************
 * 1) 顯示二級目錄（題型按鈕）
 ****************************************************/
function showTypeMenu() {
  const menu = document.getElementById("gaokao-type-menu");
  menu.style.display = "block";
  menu.innerHTML = "";
  TYPES.forEach(t => {
    const btn = document.createElement("button");
    btn.textContent = t.label;
    btn.style.fontSize = "1.8rem";
    btn.style.padding = "1rem 1.5rem";
    btn.onclick = () => {
      // 對於外部鏈接類型，直接新tab打開
      if (t.external) {
        window.open(t.external, "_blank");
      } else if (!t.dataFile) {
        alert("製作中，慢慢等~");
      } else {
        // 讀取對應 dataFile 並顯示年份列表
        fetch(`data/${t.dataFile}`)
          .then(res => res.json())
          .then(json => showYearMenu(t.key, json))
          .catch(err => {
            console.error("讀取 " + t.dataFile + " 錯誤:", err);
            alert("讀取資料錯誤，請稍後再試");
          });
      }
    };
    menu.appendChild(btn);
  });
}

/****************************************************
 * 2) 顯示三級目錄：年份列表
 ****************************************************/
function showYearMenu(typeKey, dataArr) {
  const yearMenu = document.getElementById("gaokao-year-menu");
  yearMenu.style.display = "block";
  yearMenu.innerHTML = "";
  // 保持二級目錄不隱藏

  // 整理所有年份
  const years = [...new Set(dataArr.map(item => item.year))].sort((a, b) => b - a);
  years.forEach(y => {
    const btn = document.createElement("button");
    btn.textContent = y + " 年";
    btn.style.fontSize = "1.8rem";
    btn.style.padding = "1rem 1.5rem";
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
  questionSec.innerHTML = `<h2>${year} 年真題</h2>`;
  const questions = dataArr.filter(q => q.year == year);
  if (questions.length > 1) {
    questions.forEach((q, idx) => {
      const btn = document.createElement("button");
      btn.textContent = (q.topic || "題目") + " #" + (idx + 1);
      btn.style.fontSize = "1.8rem";
      btn.style.padding = "1rem 1.5rem";
      btn.onclick = () => showQuestionDetail(typeKey, q);
      questionSec.appendChild(btn);
    });
  } else if (questions.length === 1) {
    showQuestionDetail(typeKey, questions[0]);
  } else {
    questionSec.innerHTML += `<p>該年份暫無資料，製作中，慢慢等~</p>`;
  }
}

/****************************************************
 * 4) 顯示選中的題目內容
 ****************************************************/
function showQuestionDetail(typeKey, q) {
  currentQuestion = q;
  const questionSec = document.getElementById("gaokao-question");
  questionSec.innerHTML = formatQuestionHTML(typeKey, q);
  // 顯示底部互動按鈕區
  document.getElementById("gaokao-actions").style.display = "block";
  // 展開 AI 對話窗口，提示是否還有問題
  document.getElementById("dialogue-box").style.display = "block";
  addMessage("是否還有其他問題？", "system");
}

/****************************************************
 * 4.1) 將題目資料格式化為 HTML
 ****************************************************/
function formatQuestionHTML(typeKey, q) {
  let html = `<h2>${q.year}年 ${q.topic || ""}</h2>`;
  // 根據題型顯示不同字段
  if (q.material1) html += `<p><strong>材料1：</strong>${q.material1}</p>`;
  if (q.material2) html += `<p><strong>材料2：</strong>${q.material2}</p>`;
  if (q.original_text) html += `<p><strong>原文：</strong>${q.original_text}</p>`;
  if (q.annotation) html += `<p><strong>注釋：</strong>${q.annotation}</p>`;
  if (q.poem_text) html += `<p><strong>詩文：</strong>${q.poem_text}</p>`;
  for (let i = 1; i <= 5; i++) {
    if (q[`question${i}`]) {
      html += `<p><strong>問題${i}：</strong>${q[`question${i}`]}</p>`;
    }
  }
  if (q.prompts) {
    q.prompts.forEach((p, idx) => {
      html += `<p><strong>作文提示${idx+1}：</strong>${p.prompt_text}</p>`;
    });
  }
  return html;
}

/****************************************************
 * 5) 互動按鈕功能：提交答案、參考答案、AI答案
 ****************************************************/
function submitAnswer() {
  if (!currentQuestion) {
    alert("尚未選擇任何題目");
    return;
  }
  // 展開對話框並提示
  document.getElementById("dialogue-box").style.display = "block";
  addMessage("請提交你的答案：", "system");
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
  addMessage("是否還有其他問題？", "system");
}

function askAIForSolution() {
  if (!currentQuestion) {
    alert("尚未選擇任何題目");
    return;
  }
  const prompt = buildAIPrompt(currentQuestion, "solve");
  callAI(prompt);
  document.getElementById("dialogue-box").style.display = "block";
  addMessage("是否還有其他問題？", "system");
}

/****************************************************
 * 5.1) 用戶在對話框中送出答案
 ****************************************************/
function sendUserInput() {
  const userInput = document.getElementById("userInput").value.trim();
  if (!userInput) return;
  addMessage("你：" + userInput, "user");
  // 例如：提交答案模式使用 review
  if (currentQuestion.reference_answer) {
    const prompt = buildAIPrompt(currentQuestion, "review", userInput);
    callAI(prompt);
  } else {
    const prompt = buildAIPrompt(currentQuestion, "solve", userInput);
    callAI(prompt);
  }
  document.getElementById("userInput").value = "";
}

/****************************************************
 * 6) 建立AI prompt（mode: "review" 或 "solve"）
 ****************************************************/
function buildAIPrompt(q, mode, userAnswer="") {
  let typeKey = guessTypeFromQuestion(q);
  let prefix = GAOKAO_PROMPTS[typeKey] || "這是一道高考題，請分析：";
  let base = `${prefix}\n題目信息：\n`;
  if (q.material1) base += `材料1：${q.material1}\n`;
  if (q.material2) base += `材料2：${q.material2}\n`;
  if (q.original_text) base += `原文：${q.original_text}\n`;
  if (q.annotation) base += `注釋：${q.annotation}\n`;
  if (q.poem_text) base += `詩文：${q.poem_text}\n`;
  for (let i = 1; i <= 5; i++) {
    if (q[`question${i}`]) {
      base += `問題${i}：${q[`question${i}`]}\n`;
    }
  }
  if (q.prompts) {
    q.prompts.forEach((p, idx) => {
      base += `作文提示${idx+1}：${p.prompt_text}\n`;
    });
  }
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
 * 8) 呼叫 AI
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
      addMessage("AI 請求失敗，請稍後再試。", "system");
    });
}

/****************************************************
 *  夜晚模式切換
 ****************************************************/
function toggleDarkMode() {
  document.body.classList.toggle("dark-mode");
}

/****************************************************
 * 全局 AI prompt前綴設定
 ****************************************************/
const GAOKAO_PROMPTS = {
  feilian: "這是一道非連文本題，請依據下列材料回答：",
  guwen: "這是一道古文題，請依據原文和注釋回答：",
  shici: "這是一道詩詞題，請根據詩詞進行解析：",
  // 其他題型預設
  default: "這是一道高考題，請解題："
};

/****************************************************
 * 啟動程式：初始化數據與綁定事件
 ****************************************************/
document.addEventListener("DOMContentLoaded", () => {
  // 載入 dialogues.json 並初始化
  loadDialogues();
  
  // 綁定切換顯示/隱藏題型菜單 (二級目錄)
  const gaokaoBtn = document.getElementById("gaokao-btn");
  const typeMenu = document.getElementById("gaokao-type-menu");
  if (gaokaoBtn && typeMenu) {
    gaokaoBtn.addEventListener("click", () => {
      typeMenu.style.display = "block"; // 保持顯示，不隱藏
      renderGaokaoTypeMenu();
    });
  }

  // 綁定底部互動按鈕
  document.getElementById("submit-answer-btn").addEventListener("click", submitAnswer);
  document.getElementById("reference-answer-btn").addEventListener("click", showReferenceAnswer);
  document.getElementById("ai-answer-btn").addEventListener("click", askAIForSolution);
  
  // 綁定對話框送出
  document.getElementById("sendUserInputBtn").addEventListener("click", sendUserInput);

  // 綁定夜晚模式切換按鈕
  const toggleDarkBtn = document.getElementById("toggle-dark-btn");
  if (toggleDarkBtn) {
    toggleDarkBtn.addEventListener("click", toggleDarkMode);
  }
});