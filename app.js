// ===== Config =====
// API Key 存放在 Google Apps Script 端，前端不暴露
const PROXY_URL = 'https://script.google.com/macros/s/AKfycbxOfWnAiZSL2kjdn0IACKkmAq0OFnRbMEfAi79aIJpCWrdraOFozdKFCK6JpNRMm8JCTQ/exec';
const MODEL = 'gemini-3.1-flash-image-preview';

// ===== State =====
let selectedPurpose = 'social';
let selectedOutput = 'image-text';
let referenceImageData = null;
let generatedImageData = null;

// Purpose → aspect ratio mapping
const PURPOSE_MAP = {
  'social':  { ratio: '1:1',  label: '社群貼文' },
  'message': { ratio: '1:1',  label: '圖文訊息' },
  'slide-h': { ratio: '16:9', label: '簡報配圖（橫）' },
  'slide-v': { ratio: '9:16', label: '簡報配圖（直）' }
};

// ===== UI Interactions =====
function selectPurpose(el) {
  document.querySelectorAll('#purpose-options .option-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedPurpose = el.dataset.value;
}

function selectOutput(el) {
  document.querySelectorAll('#output-mode .toggle-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  selectedOutput = el.dataset.value;
}

// ===== File Upload =====
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  processFile(file);
}

function processFile(file) {
  if (!file.type.startsWith('image/')) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const base64Full = e.target.result;
    const base64Data = base64Full.split(',')[1];
    referenceImageData = { mimeType: file.type, data: base64Data };

    document.getElementById('preview-img').src = base64Full;
    document.getElementById('upload-placeholder').style.display = 'none';
    document.getElementById('upload-preview').style.display = 'block';
    document.getElementById('upload-area').classList.add('has-image');
  };
  reader.readAsDataURL(file);
}

function removeImage(event) {
  event.stopPropagation();
  referenceImageData = null;
  document.getElementById('file-input').value = '';
  document.getElementById('upload-placeholder').style.display = 'flex';
  document.getElementById('upload-preview').style.display = 'none';
  document.getElementById('upload-area').classList.remove('has-image');
}

// Drag & Drop
const uploadArea = document.getElementById('upload-area');
uploadArea.addEventListener('dragover', function (e) {
  e.preventDefault();
  uploadArea.style.borderColor = '#B8860B';
});
uploadArea.addEventListener('dragleave', function () {
  if (!referenceImageData) uploadArea.style.borderColor = '';
});
uploadArea.addEventListener('drop', function (e) {
  e.preventDefault();
  uploadArea.style.borderColor = '';
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});

// ===== Generate =====
async function generate() {
  const prompt = document.getElementById('prompt').value.trim();
  if (!prompt) {
    alert('請輸入圖片描述');
    return;
  }

  const purpose = PURPOSE_MAP[selectedPurpose];
  const wantImage = selectedOutput === 'image-text';

  // Build system prompt
  let systemPrompt = `你是一位專業的品牌視覺設計師。請根據以下描述生成圖片。
用途：${purpose.label}
比例：${purpose.ratio}`;

  if (!wantImage) {
    systemPrompt = `你是一位專業的品牌視覺設計師。請根據以下描述，提供詳細的圖片設計文字描述（包含構圖、色彩、元素配置等），不需要生成圖片。
用途：${purpose.label}
比例：${purpose.ratio}`;
  }

  // Build request parts
  const parts = [];
  parts.push({ text: systemPrompt + '\n\n描述：' + prompt });

  if (referenceImageData) {
    parts.push({
      inline_data: {
        mime_type: referenceImageData.mimeType,
        data: referenceImageData.data
      }
    });
    parts[0].text += '\n\n（請參考上傳的圖片風格）';
  }

  // Build request body
  const requestBody = {
    contents: [{ parts: parts }],
    generationConfig: {
      responseModalities: wantImage ? ['TEXT', 'IMAGE'] : ['TEXT']
    }
  };

  if (wantImage) {
    requestBody.generationConfig.imageConfig = {
      aspectRatio: purpose.ratio,
      imageSize: '1K'
    };
  }

  // Show loading
  showLoading();

  try {
    if (!PROXY_URL) {
      throw new Error('尚未設定 API 代理網址，請先部署 proxy.gs');
    }

    const response = await fetch(PROXY_URL, {
      method: 'POST',
      body: JSON.stringify({ model: MODEL, body: requestBody }),
      redirect: 'follow'
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || `API 錯誤 (${response.status})`);
    }

    const data = await response.json();
    handleResponse(data, wantImage);

  } catch (err) {
    showError(err.message);
  }
}

function handleResponse(data, wantImage) {
  const resultArea = document.getElementById('result-area');
  const loading = document.getElementById('loading');
  const content = document.getElementById('result-content');
  const imageWrapper = document.getElementById('result-image-wrapper');
  const resultImage = document.getElementById('result-image');
  const resultText = document.getElementById('result-text');
  const btnDownload = document.getElementById('btn-download');
  const errorMsg = document.getElementById('error-msg');

  loading.style.display = 'none';
  errorMsg.style.display = 'none';
  content.style.display = 'block';

  // Reset
  imageWrapper.style.display = 'none';
  resultText.style.display = 'none';
  btnDownload.style.display = 'none';
  generatedImageData = null;

  const candidates = data.candidates;
  if (!candidates || candidates.length === 0) {
    showError('未能生成結果，請調整描述後重試');
    return;
  }

  const parts = candidates[0].content.parts;
  let hasImage = false;
  let textContent = '';

  parts.forEach(part => {
    // API 回傳可能用 inlineData (camelCase) 或 inline_data (snake_case)
    const imgData = part.inline_data || part.inlineData;
    if (imgData) {
      hasImage = true;
      const mime = imgData.mime_type || imgData.mimeType;
      const b64 = imgData.data;
      const imgSrc = `data:${mime};base64,${b64}`;
      resultImage.src = imgSrc;
      generatedImageData = { mimeType: mime, data: b64 };
      imageWrapper.style.display = 'block';
      btnDownload.style.display = 'inline-block';
    }
    if (part.text) {
      textContent += part.text;
    }
  });

  if (textContent) {
    resultText.textContent = textContent;
    resultText.style.display = 'block';
  }
}

function showLoading() {
  const resultArea = document.getElementById('result-area');
  const loading = document.getElementById('loading');
  const content = document.getElementById('result-content');
  const errorMsg = document.getElementById('error-msg');

  resultArea.style.display = 'block';
  loading.style.display = 'block';
  content.style.display = 'none';
  errorMsg.style.display = 'none';

  document.getElementById('btn-generate').disabled = true;
  resultArea.scrollIntoView({ behavior: 'smooth' });

  // Re-enable button after timeout safety
  setTimeout(() => {
    document.getElementById('btn-generate').disabled = false;
  }, 60000);
}

function showError(message) {
  const resultArea = document.getElementById('result-area');
  const loading = document.getElementById('loading');
  const content = document.getElementById('result-content');
  const errorMsg = document.getElementById('error-msg');

  resultArea.style.display = 'block';
  loading.style.display = 'none';
  content.style.display = 'none';
  errorMsg.style.display = 'block';
  errorMsg.textContent = message;

  document.getElementById('btn-generate').disabled = false;
}

// ===== Download =====
function downloadImage() {
  if (!generatedImageData) return;

  const ext = generatedImageData.mimeType.split('/')[1] || 'png';
  const purpose = PURPOSE_MAP[selectedPurpose].label;
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `RIMAN_${purpose}_${timestamp}.${ext}`;

  const byteChars = atob(generatedImageData.data);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: generatedImageData.mimeType });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
