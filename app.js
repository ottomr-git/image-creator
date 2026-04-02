// ===== Config =====
// API Key 存放在 Cloudflare Worker 端，前端不暴露
const PROXY_URL = 'https://gemini-proxy.otto-mr.workers.dev';
const MODEL = 'gemini-3.1-flash-image-preview';

// ===== Products =====
const PRODUCTS = [
  { id: 'icd-derma-set',        name: '活妍專科保養組', image: 'products/icd/icd-derma-set/CMS_ICD-Dermatology-First-Package_TW-3.jpg' },
  { id: 'icd-derma-cream',      name: '活妍奇肌霜',     image: 'products/icd/icd-derma-cream/TL_DermatologyCream_DFLT.jpg' },
  { id: 'icd-oil-mist',         name: '油水平衡噴霧',   image: 'products/icd/icd-oil-mist/TL_TwoPhaseOilMist_DFLT.jpg' },
  { id: 'icd-calming-gel',      name: '舒緩平衡凝露',   image: 'products/icd/icd-calming-gel/TL_CalmingBalanceGel_DFLT1.jpg' },
  { id: 'icd-cleansing-powder', name: '活膚潔顏粉',     image: 'products/icd/icd-cleansing-powder/TL_CleansingPowderWash_DFLT.jpg' },
  { id: 'icd-cleansing-oil',    name: '淨膚卸妝油',     image: 'products/icd/icd-cleansing-oil/TL_MoistureCleansingOil_DFLT.jpg' },
  { id: 'icd-sunscreen',        name: '極效保濕防曬乳', image: 'products/icd/icd-sunscreen/TL_MoistureLayerSunScreenSPF50DEFAULT_1023.jpg' },
  { id: 'icd-bb-cream',         name: '輕透光感BB霜',   image: 'products/icd/icd-bb-cream/TL_SheerGlowBB.jpg' },
];

// ===== State =====
let selectedPurpose = 'social';
let selectedOutput = 'image-text';
let referenceImageData = null;
let generatedImageData = null;
let selectedProductId = null;

// Purpose → aspect ratio mapping
const PURPOSE_MAP = {
  'social':  { ratio: '1:1',  label: '社群貼文' },
  'message': { ratio: '1:1',  label: '圖文訊息' },
  'slide-h': { ratio: '16:9', label: '簡報配圖（橫）' },
  'slide-v': { ratio: '9:16', label: '簡報配圖（直）' }
};

// ===== Product Selector =====
function initProductSelector() {
  const container = document.getElementById('product-scroll');
  PRODUCTS.forEach(p => {
    const card = document.createElement('div');
    card.className = 'product-thumb-card';
    card.dataset.id = p.id;
    card.innerHTML = `<img src="${p.image}" alt="${p.name}"><div class="product-thumb-name">${p.name}</div>`;
    card.addEventListener('click', () => selectProduct(p, card));
    container.appendChild(card);
  });
}

function selectProduct(product, card) {
  // 如果已選同一個 → 取消選擇
  if (selectedProductId === product.id) {
    selectedProductId = null;
    referenceImageData = null;
    card.classList.remove('selected');
    resetUploadArea();
    return;
  }

  // 選新的產品
  document.querySelectorAll('.product-thumb-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedProductId = product.id;

  // 把產品圖片轉成 base64 作為參考圖
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onerror = function () {
    // 圖片載入失敗（例如尚未放入圖片素材），取消選擇
    selectedProductId = null;
    card.classList.remove('selected');
    resetUploadArea();
  };
  img.onload = function () {
    // 防護：寬高為 0 代表圖片損毀，避免送出壞掉的 base64
    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
      selectedProductId = null;
      card.classList.remove('selected');
      resetUploadArea();
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    const base64Full = canvas.toDataURL('image/jpeg', 0.9);
    const base64Data = base64Full.split(',')[1];
    referenceImageData = { mimeType: 'image/jpeg', data: base64Data };

    // 更新上傳區預覽
    document.getElementById('preview-img').src = base64Full;
    document.getElementById('upload-placeholder').style.display = 'none';
    document.getElementById('upload-preview').style.display = 'block';
    document.getElementById('upload-area').classList.add('has-image');
  };
  img.src = product.image;
}

function resetUploadArea() {
  document.getElementById('file-input').value = '';
  document.getElementById('upload-placeholder').style.display = 'flex';
  document.getElementById('upload-preview').style.display = 'none';
  document.getElementById('upload-area').classList.remove('has-image');
}

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
  selectedProductId = null;
  document.querySelectorAll('.product-thumb-card').forEach(c => c.classList.remove('selected'));
  resetUploadArea();
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', initProductSelector);

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

    const rawText = await response.text();
    console.log('Proxy raw response length:', rawText.length);
    console.log('Proxy raw response (first 500 chars):', rawText.substring(0, 500));

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      throw new Error('回應解析失敗：' + rawText.substring(0, 200));
    }

    console.log('Parsed response keys:', Object.keys(data));
    if (data.error) {
      console.error('API error:', data.error);
      throw new Error(data.error.message || JSON.stringify(data.error));
    }

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
    console.error('No candidates in response. Full response:', JSON.stringify(data).substring(0, 1000));
    showError('未能生成結果。回應內容：' + JSON.stringify(data).substring(0, 300));
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
