// ===== Google Apps Script — Gemini API Proxy =====
// 部署方式同 counter.gs：
// 1. 開啟 Google Sheets → 擴充功能 → Apps Script
// 2. 新增一個指令碼檔案（點 + 號），命名為 proxy
// 3. 貼上此程式碼
// 4. 部署 → 新增部署作業 → 網頁應用程式 → 所有人可存取
// 5. 複製部署後的網址

var GEMINI_API_KEY = 'AIzaSyDRWhystNiIygr0cfAURNTnbx9v6ikFKus';

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var model = payload.model || 'gemini-2.5-flash-preview-image-generation';
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + GEMINI_API_KEY;

    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload.body),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(url, options);
    return ContentService.createTextOutput(response.getContentText())
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
