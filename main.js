// 导入 Shamir 秘密分享库和 BIP39 单词列表
import { split, combine } from 'shamir-secret-sharing';
import { BIP39_WORDLIST } from './bip39-words.js';

// 全局变量
let currentWordCount = 12;
let autocompleteTimeouts = new Map(); // 存储每个输入框的防抖定时器

// 初始化页面
function init() {
  setWordCount(12);
  updateThresholdOptions();
  document.getElementById('totalShares').addEventListener('change', updateThresholdOptions);
}

// 设置助记词数量
function setWordCount(count) {
  currentWordCount = count;

  document.getElementById('words12').classList.toggle('active', count === 12);
  document.getElementById('words24').classList.toggle('active', count === 24);

  generateWordInputs();
}

// 生成助记词输入框
function generateWordInputs() {
  const grid = document.getElementById('wordsGrid');
  grid.innerHTML = '';

  for (let i = 1; i <= currentWordCount; i++) {
    const wordInput = document.createElement('div');
    wordInput.className = 'word-input';
    wordInput.innerHTML = `
            <div class="input-wrapper">
                <input type="text" id="word${i}" placeholder=" " autocomplete="off">
                <label for="word${i}">${i}. 单词</label>
                <div class="autocomplete-suggestions" id="suggestions${i}"></div>
            </div>
        `;
    grid.appendChild(wordInput);

    // 为输入框添加事件监听器
    const input = document.getElementById(`word${i}`);
    const suggestionsDiv = document.getElementById(`suggestions${i}`);

    // 输入事件 - 防抖处理
    input.addEventListener('input', (e) => {
      handleWordInput(e.target, i);
    });

    // 失去焦点时验证输入并隐藏建议
    input.addEventListener('blur', () => {
      setTimeout(() => {
        validateWordInput(input, i);
        hideSuggestions(i);
      }, 200); // 延迟隐藏，允许点击建议项
    });

    // 获得焦点时，如果有内容则显示建议
    input.addEventListener('focus', (e) => {
      if (e.target.value.trim().length > 0) {
        handleWordInput(e.target, i);
      }
    });
  }
}

// 处理单词输入，实现防抖
function handleWordInput(input, wordIndex) {
  const value = input.value.trim().toLowerCase();

  // 清除之前的定时器
  if (autocompleteTimeouts.has(wordIndex)) {
    clearTimeout(autocompleteTimeouts.get(wordIndex));
  }

  // 如果输入为空，隐藏建议
  if (value.length === 0) {
    hideSuggestions(wordIndex);
    checkDuplicateWords();
    return;
  }

  // 设置新的定时器，100ms后显示建议
  const timeoutId = setTimeout(() => {
    showSuggestions(value, wordIndex);
    checkDuplicateWords();
  }, 100);

  autocompleteTimeouts.set(wordIndex, timeoutId);
}

// 验证是否为有效的 BIP39 单词
function isValidBIP39Word(word) {
  if (!word || word.trim().length === 0) return false;
  return BIP39_WORDLIST.includes(word.trim().toLowerCase());
}

// 验证单词输入
function validateWordInput(input, wordIndex) {
  const value = input.value.trim();

  // 如果输入为空，直接返回
  if (value.length === 0) {
    input.classList.remove('invalid-word', 'valid-word');
    return;
  }

  // 验证是否为有效的 BIP39 单词
  if (isValidBIP39Word(value)) {
    input.classList.remove('invalid-word');
    input.classList.add('valid-word');
  } else {
    input.classList.remove('valid-word');
    input.classList.add('invalid-word');

    // 清空无效输入
    input.value = '';

    // 显示错误提示
    showInvalidWordWarning(wordIndex);
  }

  // 检查重复单词
  checkDuplicateWords();
}

// 显示无效单词警告
function showInvalidWordWarning(wordIndex) {
  const errorAlert = document.getElementById('inputErrorAlert');
  errorAlert.innerHTML = `<strong>❌ 无效助记词：</strong> 第 ${wordIndex} 个输入框中的单词不是有效的 BIP39 单词，已自动清空。请从建议列表中选择有效的单词。`;
  errorAlert.style.display = 'block';

  // 3秒后自动隐藏警告
  setTimeout(() => {
    errorAlert.style.display = 'none';
  }, 3000);
}

// 检查重复单词
function checkDuplicateWords() {
  const words = [];
  const duplicates = new Set();
  const duplicatePositions = new Map(); // 存储重复单词及其位置

  // 收集所有输入的单词
  for (let i = 1; i <= currentWordCount; i++) {
    const word = document.getElementById(`word${i}`).value.trim().toLowerCase();
    if (word) {
      if (words.includes(word)) {
        duplicates.add(word);
        if (!duplicatePositions.has(word)) {
          duplicatePositions.set(word, []);
        }
        duplicatePositions.get(word).push(i);
      } else {
        words.push(word);
      }
    }
  }

  // 显示或隐藏重复单词提示
  const duplicateAlert = document.getElementById('duplicateAlert');

  if (duplicates.size > 0) {
    // 构建详细的重复信息
    let duplicateDetails = '';
    for (const [word, positions] of duplicatePositions) {
      if (duplicateDetails) duplicateDetails += '<br>';
      duplicateDetails += `<strong>${word}</strong>: 位置 ${positions.join(', ')}`;
    }

    // 更新提示内容
    duplicateAlert.innerHTML = `<strong>⚠️ 检测到重复单词：</strong><br>${duplicateDetails}<br><small>助记词中的单词应该是唯一的，请检查并修改重复的单词。</small>`;
    duplicateAlert.style.display = 'block';

    // 为重复的单词添加视觉标记
    for (let i = 1; i <= currentWordCount; i++) {
      const input = document.getElementById(`word${i}`);
      const word = input.value.trim().toLowerCase();

      if (word && duplicates.has(word)) {
        input.classList.add('duplicate-word');
      } else {
        input.classList.remove('duplicate-word');
      }
    }
  } else {
    // 隐藏提示并移除所有重复标记
    duplicateAlert.style.display = 'none';
    for (let i = 1; i <= currentWordCount; i++) {
      document.getElementById(`word${i}`).classList.remove('duplicate-word');
    }
  }
}

// 搜索匹配的BIP39单词
function searchBIP39Words(query) {
  if (query.length === 0) {
    return [];
  }

  const matches = BIP39_WORDLIST.filter((word) => word.toLowerCase().startsWith(query)).slice(0, 5); // 最多返回5个候选词
  return matches;
}

// 显示建议列表
function showSuggestions(query, wordIndex) {
  const suggestions = searchBIP39Words(query);
  const suggestionsDiv = document.getElementById(`suggestions${wordIndex}`);

  if (suggestions.length === 0) {
    hideSuggestions(wordIndex);
    return;
  }

  suggestionsDiv.innerHTML = '';
  suggestionsDiv.style.display = 'block';

  // 简化定位逻辑 - 统一使用绝对定位
  suggestionsDiv.style.position = 'absolute';
  suggestionsDiv.style.top = '100%';
  suggestionsDiv.style.left = '0';
  suggestionsDiv.style.right = '0';
  suggestionsDiv.style.width = 'auto';
  suggestionsDiv.style.zIndex = '99999';

  // 创建容器
  const container = document.createElement('div');
  container.className = 'suggestions-container';

  suggestions.forEach((word) => {
    const suggestionItem = document.createElement('div');
    suggestionItem.className = 'suggestion-item';
    suggestionItem.textContent = word;
    suggestionItem.addEventListener('click', () => {
      selectWord(word, wordIndex);
    });
    container.appendChild(suggestionItem);
  });

  suggestionsDiv.appendChild(container);
}

// 隐藏建议列表
function hideSuggestions(wordIndex) {
  const suggestionsDiv = document.getElementById(`suggestions${wordIndex}`);
  suggestionsDiv.style.display = 'none';
  suggestionsDiv.innerHTML = '';
}

// 选择单词并填入输入框
function selectWord(word, wordIndex) {
  const input = document.getElementById(`word${wordIndex}`);
  input.value = word;

  // 标记为有效单词
  input.classList.remove('invalid-word');
  input.classList.add('valid-word');

  hideSuggestions(wordIndex);
  checkDuplicateWords();

  // 自动跳转到下一个输入框
  if (wordIndex < currentWordCount) {
    const nextInput = document.getElementById(`word${wordIndex + 1}`);
    nextInput.focus();
  }
}

// 更新阈值选项
function updateThresholdOptions() {
  const totalShares = parseInt(document.getElementById('totalShares').value);
  const thresholdSelect = document.getElementById('threshold');
  const currentThreshold = parseInt(thresholdSelect.value);

  thresholdSelect.innerHTML = '';

  for (let i = 2; i <= totalShares; i++) {
    const option = document.createElement('option');
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
  let hasInvalidWord = false;
  let invalidWordIndex = -1;

  // 验证所有输入的单词
  for (let i = 1; i <= currentWordCount; i++) {
    const word = document.getElementById(`word${i}`).value.trim();
    if (!word) {
      hasEmpty = true;
      break;
    }

    // 验证是否为有效的 BIP39 单词
    if (!isValidBIP39Word(word)) {
      hasInvalidWord = true;
      invalidWordIndex = i;
      break;
    }

    words.push(word);
  }

  if (hasEmpty) {
    showAlert('请填写所有助记词！', 'error');
    return;
  }

  if (hasInvalidWord) {
    showAlert(`第 ${invalidWordIndex} 个单词不是有效的 BIP39 单词，请从建议列表中选择有效的单词。`, 'error');
    // 高亮无效输入框
    const invalidInput = document.getElementById(`word${invalidWordIndex}`);
    invalidInput.classList.add('invalid-word');
    invalidInput.focus();
    return;
  }

  // 检查重复单词
  const wordSet = new Set();
  const duplicates = new Set();
  for (const word of words) {
    if (wordSet.has(word)) {
      duplicates.add(word);
    } else {
      wordSet.add(word);
    }
  }

  if (duplicates.size > 0) {
    const duplicateWords = Array.from(duplicates).join(', ');
    showAlert(`检测到重复单词：${duplicateWords}。助记词中的单词应该是唯一的，请修改重复的单词。`, 'error');

    // 高亮重复的单词
    for (let i = 1; i <= currentWordCount; i++) {
      const word = document.getElementById(`word${i}`).value.trim().toLowerCase();
      if (duplicates.has(word)) {
        document.getElementById(`word${i}`).classList.add('duplicate-word');
      }
    }

    // 聚焦到第一个重复的单词
    for (let i = 1; i <= currentWordCount; i++) {
      const word = document.getElementById(`word${i}`).value.trim().toLowerCase();
      if (duplicates.has(word)) {
        document.getElementById(`word${i}`).focus();
        break;
      }
    }
    return;
  }

  const totalShares = parseInt(document.getElementById('totalShares').value);
  const threshold = parseInt(document.getElementById('threshold').value);

  try {
    const mnemonic = words.join(' ');
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
    showAlert('分片生成成功！请安全保存这些分片。', 'success');
  } catch (error) {
    showAlert(`生成分片失败: ${error.message}`, 'error');
  }
}

// 显示分片
function displayShares(shares, threshold) {
  const resultDiv = document.getElementById('sharesResult');
  const sharesList = document.getElementById('sharesList');
  const thresholdDisplay = document.getElementById('thresholdDisplay');

  thresholdDisplay.textContent = threshold;
  sharesList.innerHTML = '';

  shares.forEach((share, index) => {
    const shareItem = document.createElement('div');
    shareItem.className = 'share-item';
    shareItem.innerHTML = `
            <div class="share-header">
                <div class="share-title">分片 ${index + 1}</div>
                <button class="copy-btn" onclick="copyShare(this, '${share}')">复制</button>
            </div>
            <div class="share-content">${share}</div>
        `;
    sharesList.appendChild(shareItem);
  });

  resultDiv.style.display = 'block';
}

// 复制分片
function copyShare(button, shareContent) {
  navigator.clipboard
    .writeText(shareContent)
    .then(() => {
      const originalText = button.textContent;
      button.textContent = '已复制';
      button.classList.add('copied');

      setTimeout(() => {
        button.textContent = originalText;
        button.classList.remove('copied');
      }, 2000);
    })
    .catch(() => {
      showAlert('复制失败，请手动复制', 'error');
    });
}

// 验证分片输入
function validateShares() {
  const input = document.getElementById('recoverInput').value.trim();
  const statusDiv = document.getElementById('inputStatus');
  const recoverBtn = document.getElementById('recoverBtn');

  if (!input) {
    statusDiv.className = 'input-status waiting';
    statusDiv.innerHTML = '<span class="status-text">等待输入分片...</span>';
    recoverBtn.disabled = true;
    return;
  }

  try {
    const shareStrings = input
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (shareStrings.length === 0) {
      statusDiv.className = 'input-status waiting';
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
      statusDiv.className = 'input-status invalid';
      statusDiv.innerHTML = '<span class="status-text">❌ 未检测到有效分片，请检查格式</span>';
      recoverBtn.disabled = true;
      return;
    }

    if (validShares < threshold) {
      statusDiv.className = 'input-status insufficient';
      statusDiv.innerHTML = `<span class="status-text">⚠️ 检测到 ${validShares} 个有效分片，需要至少 ${threshold} 个分片才能恢复</span>`;
      recoverBtn.disabled = true;
      return;
    }

    statusDiv.className = 'input-status valid';
    statusDiv.innerHTML = `<span class="status-text">✅ 检测到 ${validShares} 个有效分片（需要 ${threshold} 个），可以开始恢复</span>`;
    recoverBtn.disabled = false;
  } catch (error) {
    statusDiv.className = 'input-status invalid';
    statusDiv.innerHTML = '<span class="status-text">❌ 分片格式错误，请检查输入</span>';
    recoverBtn.disabled = true;
  }
}

// 恢复助记词
async function recoverMnemonic() {
  const input = document.getElementById('recoverInput').value.trim();
  const resultDiv = document.getElementById('recoverResult');
  const recoverBtn = document.getElementById('recoverBtn');

  if (!input) {
    showAlert('请输入分片内容！', 'error');
    return;
  }

  // 显示处理状态
  recoverBtn.disabled = true;
  recoverBtn.textContent = '🔄 正在恢复...';

  try {
    const shareStrings = input
      .split('\n')
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
        // 跳过无效分片
      }
    }

    if (validShareData.length === 0) {
      throw new Error('没有找到有效的分片数据');
    }

    const threshold = validShareData[0].threshold;
    if (validShareData.length < threshold) {
      throw new Error(`需要至少 ${threshold} 个有效分片，当前只有 ${validShareData.length} 个`);
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
                <strong>使用分片数：</strong>${validShareData.length} 个（需要 ${threshold} 个）<br>
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
    recoverBtn.textContent = '🔓 恢复助记词';
  }
}

// 显示提示信息
function showAlert(message, type) {
  // 隐藏所有提示区域
  hideAllAlerts();

  let alertElement;

  // 根据类型选择合适的提示区域
  switch (type) {
    case 'success':
      alertElement = document.getElementById('successAlert');
      break;
    case 'error':
      alertElement = document.getElementById('generalErrorAlert');
      break;
    default:
      // 对于其他类型，使用通用错误提示
      alertElement = document.getElementById('generalErrorAlert');
      break;
  }

  // 设置提示内容并显示
  alertElement.innerHTML = message;
  alertElement.style.display = 'block';

  // 3秒后自动隐藏
  setTimeout(() => {
    alertElement.style.display = 'none';
  }, 3000);
}

// 隐藏所有提示区域
function hideAllAlerts() {
  document.getElementById('inputErrorAlert').style.display = 'none';
  document.getElementById('duplicateAlert').style.display = 'none';
  document.getElementById('generalErrorAlert').style.display = 'none';
  document.getElementById('successAlert').style.display = 'none';
}


// 将函数绑定到全局作用域
window.setWordCount = setWordCount;
window.generateShares = generateShares;
window.copyShare = copyShare;
window.recoverMnemonic = recoverMnemonic;
window.validateShares = validateShares;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
