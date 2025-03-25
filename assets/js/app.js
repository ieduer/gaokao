/****************************************************
 * 配置 & 全局變數
 ****************************************************/
// Cloudflare Worker URL
const CLOUD_FLARE_WORKER_URL = "https://gaokao.bdfz.workers.dev/";

// 全局變數：存放目前選中的題目資料
let currentQuestion = null;

// 預設 AI Prompt 前綴：針對不同題型
const GAOKAO_PROMPTS = {
  feilian: "這是一道非連文本閱讀題，請依照下列材料和問題作答：",
  guwen: "這是一道古文閱讀題，請依照原文和問題作答：",
  shici: "這是一道詩詞閱讀題，請依照題目與詩詞進行分析：",
  hongloumeng: "紅樓夢閱讀題：",
  lunyu: "論語閱讀題：",
  sanwen: "散文閱讀題：",
  yuyanjichu: "語言基礎運用題：",
  weixiezuo: "微寫作題：",
  dazuowen: "大作文題："
};

/****************************************************
 * 假設資料結構（示例）
 * 你可以在 data/ 目錄中放 feilian.json, guwen.json, etc
 * year -> array of questions
 ****************************************************/
/*
 feilian.json
 [
   {
     "year": 2024,
     "topic": "非連文本示例題",
     "material1": "...",
     "material2": "...",
     "question1": "...",
     "reference_answer": "...",
     ...
   }
 ]
*/

/****************************************************
 * 項目初始化：點擊「高考真題」顯示八個二級目錄
 ****************************************************/
document.addEventListener("DOMContentLoaded", () => {
  const gaokaoBtn = document.getElementById("gaokao-btn");
  if (gaokaoBtn) {
    gaokaoBtn.addEventListener("click", showGaokaoTypeMenu);
  }

  // 綁定底部互動按鈕
  document.getElementById("submit-answer-btn").addEventListener("click", submitAnswer);
  document.getElementById("reference-answer-btn").addEventListener("click", showReferenceAnswer);
  document.getElementById("ai-answer-btn").addEventListener("click", askAIForSolution);

  // 綁定對話框送出
  document.getElementById("sendUserInputBtn").addEventListener("click", sendUserInput);
});

/****************************************************
 * 1) 顯示八個二級目錄
 ****************************************************/
function showGaokaoTypeMenu() {
  const menu = document.getElementById("gaokao-type-menu");
  if (!menu) return;
  menu.style.display = "block";
  menu.innerHTML = ""; // 清空

  // 定義 8 個類型
  const types = [
    { key: "feilian", label: "非連文本", dataFile: "feilian.json" },
    { key: "guwen", label: "古文", dataFile: "guwen.json" },
    { key: "shici", label: "詩詞", dataFile: "shici.json" },
    { key: "hongloumeng", label: "紅樓夢 / 論語" },
    { key: "sanwen", label: "散文", dataFile: "sanwen.json" },
    { key: "yuyanjichu", label: "語言基礎運用", dataFile: "yuyanjichu.json" },
    { key: "weixiezuo", label: "微寫作", dataFile: "weixiezuo.json" },
    { key: "dazuowen", label: "大作文", dataFile: "dazuowen.json" }
  ];

  types.forEach(t => {
    const btn = document.createElement("button");
    btn.textContent = t.label;
    btn.onclick = () => {
      if (t.key === "hongloumeng") {
        // 紅樓夢 / 論語 => 直接外部連結
        showHonglouLunyuMenu();
      } else if (!t.dataFile) {
        // 可能沒有對應 data => 提示製作中
        alert("製作中，慢慢等~");
      } else {
        // 讀取對應 dataFile => 顯示年份列表
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
 * 1.1) 紅樓夢 / 論語 => 直接顯示連結
 ****************************************************/
function showHonglouLunyuMenu() {
  alert("此處顯示兩個連結：論語 / 紅樓夢");
  // 直接新分頁打開
  window.open("https://kz.bdfz.net/", "_blank"); // 論語
  window.open("https://hlm.bdfz.net/", "_blank"); // 紅樓夢
}

/****************************************************
 * 2) 顯示年份 (三級目錄)
 ****************************************************/
function showYearMenu(typeKey, dataArr) {
  const yearMenu = document.getElementById("gaokao-year-menu");
  if (!yearMenu) return;
  yearMenu.style.display = "block";
  yearMenu.innerHTML = "";

  // 先把二級菜單隱藏
  document.getElementById("gaokao-type-menu").style.display = "none";

  // 整理出所有年份
  // 假設 dataArr = [ { year:2024, ... }, { year:2023, ...} ...]
  const years = [...new Set(dataArr.map(item => item.year))].sort((a,b) => b - a);

  years.forEach(y => {
    const btn = document.createElement("button");
    btn.textContent = y + " 年";
    btn.onclick = () => {
      // 顯示該年份所有題目
      showQuestionList(typeKey, y, dataArr);
    };
    yearMenu.appendChild(btn);
  });
}

/****************************************************
 * 3) 顯示該年份的題目列表 or 直接顯示(若只有一題)
 ****************************************************/
function showQuestionList(typeKey, year, dataArr) {
  // 先隱藏年份菜單
  document.getElementById("gaokao-year-menu").style.display = "none";

  const questionSec = document.getElementById("gaokao-question");
  questionSec.style.display = "block";
  questionSec.innerHTML = "";

  // 篩選該年份題目
  const questions = dataArr.filter(q => q.year == year);

  // 假設可能有多題
  if (questions.length > 1) {
    questions.forEach((q, idx) => {
      const btn = document.createElement("button");
      btn.textContent = (q.topic || "題目") + " #" + (idx+1);
      btn.onclick = () => showQuestionDetail(typeKey, q);
      questionSec.appendChild(btn);
    });
  } else if (questions.length === 1) {
    showQuestionDetail(typeKey, questions[0]);
  } else {
    questionSec.innerHTML = `<p>該年份暫無資料</p>`;
  }
}

/****************************************************
 * 4) 顯示選中的題目內容
 ****************************************************/
function showQuestionDetail(typeKey, questionData) {
  currentQuestion = questionData; // 全局紀錄
  const questionSec = document.getElementById("gaokao-question");
  questionSec.innerHTML = formatQuestionHTML(typeKey, questionData);

  // 顯示底部互動按鈕
  document.getElementById("gaokao-actions").style.display = "block";
  // 隱藏對話框
  document.getElementById("dialogue-box").style.display = "none";
}

/****************************************************
 * 4.1) 將題目資料轉為 HTML 顯示
 ****************************************************/
function formatQuestionHTML(typeKey, q) {
  let html = `<h2>${q.year}年 ${q.topic || ""}</h2>`;
  // 根據題型，顯示不同字段
  if (q.material1) html += `<p><strong>材料1：</strong>${q.material1}</p>`;
  if (q.material2) html += `<p><strong>材料2：</strong>${q.material2}</p>`;
  if (q.original_text) html += `<p><strong>原文：</strong>${q.original_text}</p>`;
  if (q.annotation) html += `<p><strong>注釋：</strong>${q.annotation}</p>`;
  if (q.poem_text) html += `<p><strong>詩文：</strong>${q.poem_text}</p>`;

  // 顯示所有 questionX
  for (let i=1; i<=5; i++) {
    if (q[`question${i}`]) {
      html += `<p><strong>問題${i}：</strong>${q[`question${i}`]}</p>`;
    }
  }

  // 大作文可能有 prompts array
  if (q.prompts) {
    q.prompts.forEach((p, idx) => {
      html += `<p><strong>作文提示${idx+1}：</strong>${p.prompt_text}</p>`;
    });
  }

  return html;
}

/****************************************************
 * 5) 底部互動按鈕：提交答案
 ****************************************************/
function submitAnswer() {
  if (!currentQuestion) {
    alert("尚未選擇任何題目");
    return;
  }
  // 顯示對話框，讓用戶輸入答案
  document.getElementById("dialogue-box").style.display = "block";
  addMessage("請輸入你的答案：", "system");
}

/****************************************************
 * 5.1) 用戶在對話框輸入後送出
 ****************************************************/
function sendUserInput() {
  const userInput = document.getElementById("userInput").value.trim();
  if (!userInput) return;
  addMessage("你：" + userInput, "user");
  document.getElementById("userInput").value = "";

  // 如果該題有 reference_answer，就根據參考答案進行審閱
  if (currentQuestion.reference_answer) {
    // AI prompt: "請依照以下參考答案，審閱用戶提交的答案"
    const prompt = buildAIPrompt(currentQuestion, "review", userInput);
    callAI(prompt);
  } else {
    // 沒有參考答案 => AI 自己評分
    const prompt = buildAIPrompt(currentQuestion, "solve", userInput);
    callAI(prompt);
  }
}

/****************************************************
 * 6) 參考答案
 ****************************************************/
function showReferenceAnswer() {
  if (!currentQuestion) {
    alert("尚未選擇任何題目");
    return;
  }
  if (currentQuestion.reference_answer) {
    addMessage("<strong>參考答案：</strong><br/>" + currentQuestion.reference_answer, "system");
  } else {
    // 沒有參考答案 => 交給AI直接做
    const prompt = buildAIPrompt(currentQuestion, "solve");
    callAI(prompt);
  }
}

/****************************************************
 * 7) AI答案
 ****************************************************/
function askAIForSolution() {
  if (!currentQuestion) {
    alert("尚未選擇任何題目");
    return;
  }
  // 不管有無參考答案，都交給AI直接做
  const prompt = buildAIPrompt(currentQuestion, "solve");
  callAI(prompt);
}

/****************************************************
 * 8) 建立AI prompt
 * mode = "review" or "solve"
 * userAnswer: 用戶提交的答案 (若有)
 ****************************************************/
function buildAIPrompt(q, mode, userAnswer="") {
  // 依題型 (feilian, guwen, etc) 取得前綴
  let typeKey = guessTypeFromQuestion(q);
  let prefix = GAOKAO_PROMPTS[typeKey] || "這是一道高考題，請分析：";

  let base = `${prefix}\n題目信息：\n`;

  // 合併題目資料
  if (q.material1) base += `材料1：${q.material1}\n`;
  if (q.material2) base += `材料2：${q.material2}\n`;
  if (q.original_text) base += `原文：${q.original_text}\n`;
  if (q.annotation) base += `注釋：${q.annotation}\n`;
  if (q.poem_text) base += `詩文：${q.poem_text}\n`;

  for (let i=1; i<=5; i++) {
    if (q[`question${i}`]) {
      base += `問題${i}：${q[`question${i}`]}\n`;
    }
  }
  if (q.prompts) {
    q.prompts.forEach((p, idx) => {
      base += `作文提示${idx+1}：${p.prompt_text}\n`;
    });
  }

  // 若是 review 模式，AI 需根據 reference_answer 或自我判斷評分
  if (mode === "review") {
    base += `\n用戶的答案：${userAnswer}\n參考答案：${q.reference_answer}\n請幫我評價用戶答案，並給出建議。\n`;
  } else {
    // solve 模式 => AI直接做題
    base += `\n請根據以上內容，直接完成解答。用戶答案：${userAnswer}\n若無參考答案則請完整作答。\n`;
  }

  return base;
}

/****************************************************
 * 輔助：猜測題型 feilian / guwen / shici / ...
 ****************************************************/
function guessTypeFromQuestion(q) {
  // 這裡可根據 dataFile 或 q.someField 來判斷
  // 簡單示範
  if (q.material1 && q.material2) return "feilian";
  if (q.original_text) return "guwen";
  if (q.poem_text) return "shici";
  // ...
  return "feilian"; // fallback
}

/****************************************************
 * 呼叫AI
 ****************************************************/
function callAI(prompt) {
  addMessage("<em>AI思考中...</em>", "system");
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