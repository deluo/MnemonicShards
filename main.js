// 导入 Shamir 秘密分享库
import { split, combine } from "shamir-secret-sharing";

// 全局变量
let currentWordCount = 12;

// 初始化页面
function init() {
  setWordCount(12);
  updateThresholdOptions();
  document
    .getElementById("totalShares")
    .addEventListener("change", updateThresholdOptions);
  console.log("✅ 使用专业 shamir-secret-sharing 库");
}

// 设置助记词数量
function setWordCount(count) {
  currentWordCount = count;

  document.getElementById("words12").classList.toggle("active", count === 12);
  document.getElementById("words24").classList.toggle("active", count === 24);

  generateWordInputs();
}

// 生成助记词输入框
function generateWordInputs() {
  const grid = document.getElementById("wordsGrid");
  grid.innerHTML = "";

  for (let i = 1; i <= currentWordCount; i++) {
    const wordInput = document.createElement("div");
    wordInput.className = "word-input";
    wordInput.innerHTML = `
            <input type="text" id="word${i}" placeholder=" ">
            <label for="word${i}">${i}. 单词</label>
        `;
    grid.appendChild(wordInput);
  }
}

// 更新阈值选项
function updateThresholdOptions() {
  const totalShares = parseInt(document.getElementById("totalShares").value);
  const thresholdSelect = document.getElementById("threshold");
  const currentThreshold = parseInt(thresholdSelect.value);

  thresholdSelect.innerHTML = "";

  for (let i = 2; i <= totalShares; i++) {
    const option = document.createElement("option");
    option.value = i;
    option.textContent = `${i} 个分片`;
    if (i === Math.min(currentThreshold, totalShares)) {
      option.selected = true;
    }
    thresholdSelect.appendChild(option);
  }
}

// 生成分片
async function generateShares() {
  const words = [];
  let hasEmpty = false;

  for (let i = 1; i <= currentWordCount; i++) {
    const word = document.getElementById(`word${i}`).value.trim();
    if (!word) {
      hasEmpty = true;
      break;
    }
    words.push(word);
  }

  if (hasEmpty) {
    showAlert("请填写所有助记词！", "error");
    return;
  }

  const totalShares = parseInt(document.getElementById("totalShares").value);
  const threshold = parseInt(document.getElementById("threshold").value);

  try {
    const mnemonic = words.join(" ");
    const secretBytes = new TextEncoder().encode(mnemonic);
    const rawShares = await split(secretBytes, totalShares, threshold);

    // 转换为 Base64 格式
    const shares = rawShares.map((share, index) => {
      const shareData = {
        index: index + 1,
        threshold: threshold,
        total: totalShares,
        data: btoa(String.fromCharCode(...share)),
      };
      return btoa(JSON.stringify(shareData));
    });

    displayShares(shares, threshold);
    showAlert("分片生成成功！请安全保存这些分片。", "success");
  } catch (error) {
    showAlert(`生成分片失败: ${error.message}`, "error");
  }
}

// 显示分片
function displayShares(shares, threshold) {
  const resultDiv = document.getElementById("sharesResult");
  const sharesList = document.getElementById("sharesList");
  const thresholdDisplay = document.getElementById("thresholdDisplay");

  thresholdDisplay.textContent = threshold;
  sharesList.innerHTML = "";

  shares.forEach((share, index) => {
    const shareItem = document.createElement("div");
    shareItem.className = "share-item";
    shareItem.innerHTML = `
            <div class="share-header">
                <div class="share-title">分片 ${index + 1}</div>
                <button class="copy-btn" onclick="copyShare(this, '${share}')">复制</button>
            </div>
            <div class="share-content">${share}</div>
        `;
    sharesList.appendChild(shareItem);
  });

  resultDiv.style.display = "block";
}

// 复制分片
function copyShare(button, shareContent) {
  navigator.clipboard
    .writeText(shareContent)
    .then(() => {
      const originalText = button.textContent;
      button.textContent = "已复制";
      button.classList.add("copied");

      setTimeout(() => {
        button.textContent = originalText;
        button.classList.remove("copied");
      }, 2000);
    })
    .catch(() => {
      showAlert("复制失败，请手动复制", "error");
    });
}

// 验证分片输入
function validateShares() {
  const input = document.getElementById("recoverInput").value.trim();
  const statusDiv = document.getElementById("inputStatus");
  const recoverBtn = document.getElementById("recoverBtn");

  if (!input) {
    statusDiv.className = "input-status waiting";
    statusDiv.innerHTML = '<span class="status-text">等待输入分片...</span>';
    recoverBtn.disabled = true;
    return;
  }

  try {
    const shareStrings = input
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (shareStrings.length === 0) {
      statusDiv.className = "input-status waiting";
      statusDiv.innerHTML = '<span class="status-text">等待输入分片...</span>';
      recoverBtn.disabled = true;
      return;
    }

    // 验证分片格式
    let validShares = 0;
    let threshold = 0;
    let shareIndices = new Set();

    for (const shareStr of shareStrings) {
      try {
        const shareData = JSON.parse(atob(shareStr));
        if (shareData.threshold && shareData.index && shareData.data) {
          validShares++;
          threshold = shareData.threshold;
          shareIndices.add(shareData.index);
        }
      } catch (e) {
        // 忽略无效分片
      }
    }

    if (validShares === 0) {
      statusDiv.className = "input-status invalid";
      statusDiv.innerHTML =
        '<span class="status-text">❌ 未检测到有效分片，请检查格式</span>';
      recoverBtn.disabled = true;
      return;
    }

    if (validShares < threshold) {
      statusDiv.className = "input-status insufficient";
      statusDiv.innerHTML = `<span class="status-text">⚠️ 检测到 ${validShares} 个有效分片，需要至少 ${threshold} 个分片才能恢复</span>`;
      recoverBtn.disabled = true;
      return;
    }

    statusDiv.className = "input-status valid";
    statusDiv.innerHTML = `<span class="status-text">✅ 检测到 ${validShares} 个有效分片（需要 ${threshold} 个），可以开始恢复</span>`;
    recoverBtn.disabled = false;
  } catch (error) {
    statusDiv.className = "input-status invalid";
    statusDiv.innerHTML =
      '<span class="status-text">❌ 分片格式错误，请检查输入</span>';
    recoverBtn.disabled = true;
  }
}

// 恢复助记词
async function recoverMnemonic() {
  const input = document.getElementById("recoverInput").value.trim();
  const resultDiv = document.getElementById("recoverResult");
  const recoverBtn = document.getElementById("recoverBtn");

  if (!input) {
    showAlert("请输入分片内容！", "error");
    return;
  }

  // 显示处理状态
  recoverBtn.disabled = true;
  recoverBtn.textContent = "🔄 正在恢复...";

  try {
    const shareStrings = input
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // 解析并验证分片数据
    const validShareData = [];
    for (const shareStr of shareStrings) {
      try {
        const shareData = JSON.parse(atob(shareStr));
        if (shareData.threshold && shareData.index && shareData.data) {
          validShareData.push(shareData);
        }
      } catch (e) {
        console.warn("跳过无效分片:", shareStr.substring(0, 50) + "...");
      }
    }

    if (validShareData.length === 0) {
      throw new Error("没有找到有效的分片数据");
    }

    const threshold = validShareData[0].threshold;
    if (validShareData.length < threshold) {
      throw new Error(
        `需要至少 ${threshold} 个有效分片，当前只有 ${validShareData.length} 个`
      );
    }

    // 转换为 Uint8Array 格式
    const shares = validShareData.slice(0, threshold).map((data) => {
      const binaryString = atob(data.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    });

    const recoveredBytes = await combine(shares);
    const recoveredMnemonic = new TextDecoder().decode(recoveredBytes);

    resultDiv.innerHTML = `
            <div class="alert alert-success">
                <strong>🎉 恢复成功！</strong><br>
                <strong>助记词：</strong><span style="font-family: 'Courier New', monospace; background: #f8f9fa; padding: 2px 6px; border-radius: 4px;">${recoveredMnemonic}</span><br>
                <strong>使用分片数：</strong>${
                  validShareData.length
                } 个（需要 ${threshold} 个）<br>
                <strong>恢复时间：</strong>${new Date().toLocaleString()}
            </div>
        `;
  } catch (error) {
    resultDiv.innerHTML = `
            <div class="alert alert-error">
                <strong>❌ 恢复失败：</strong>${error.message}<br>
                <small>请检查分片格式是否正确，确保每行一个完整的分片</small>
            </div>
        `;
  } finally {
    // 恢复按钮状态
    recoverBtn.disabled = false;
    recoverBtn.textContent = "🔓 恢复助记词";
  }
}

// 显示提示信息
function showAlert(message, type) {
  const existingAlert = document.querySelector(".temp-alert");
  if (existingAlert) {
    existingAlert.remove();
  }

  const alert = document.createElement("div");
  alert.className = `alert alert-${type} temp-alert`;
  alert.textContent = message;

  const mainContent = document.querySelector(".main-content");
  mainContent.insertBefore(alert, mainContent.firstChild);

  setTimeout(() => {
    alert.remove();
  }, 3000);
}

// 将函数绑定到全局作用域
window.setWordCount = setWordCount;
window.generateShares = generateShares;
window.copyShare = copyShare;
window.recoverMnemonic = recoverMnemonic;
window.validateShares = validateShares;

// 页面加载完成后初始化
document.addEventListener("DOMContentLoaded", init);
