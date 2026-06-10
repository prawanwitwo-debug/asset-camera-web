(function (window) {
  'use strict';

  const config = window.APP_CONFIG || {};
  const API_URL = String(config.API_URL || '').trim();

  function isApiConfigured() {
    return API_URL && !API_URL.includes('PASTE_APPS_SCRIPT_WEB_APP_EXEC_URL_HERE');
  }

  function getLocalPageUrl(page) {
    const target = String(page || 'user').toLowerCase();
    const base = window.location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '');
    if (target === 'admin') return base + 'admin.html';
    if (target === 'repair') return base + 'repair.html';
    return base + 'index.html';
  }

  async function callApi(functionName, args) {
    const name = String(functionName || '').trim();
    const params = Array.isArray(args) ? args : [];

    // ฝั่ง GitHub ไม่ควรย้อนกลับไป URL ของ Apps Script สำหรับ redirect หน้าเว็บ
    if (name === 'getScriptUrl') {
      return window.location.href.split('#')[0].split('?')[0];
    }

    if (!isApiConfigured()) {
      throw new Error('ยังไม่ได้ตั้งค่า APP_CONFIG.API_URL ใน config.js');
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      // ใช้ text/plain เพื่อลดโอกาสเกิด CORS preflight กับ Apps Script Web App
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ functionName: name, args: params })
    });

    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      throw new Error('API ไม่ได้ส่ง JSON กลับมา: ' + text.slice(0, 160));
    }

    if (!payload || payload.success === false) {
      throw new Error((payload && payload.message) || 'API error');
    }

    return payload.data;
  }

  function createRunner(successHandler, failureHandler) {
    const chain = {
      withSuccessHandler: function (handler) {
        return createRunner(handler, failureHandler);
      },
      withFailureHandler: function (handler) {
        return createRunner(successHandler, handler);
      }
    };

    return new Proxy(chain, {
      get: function (target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop !== 'string') return target[prop];
        return function () {
          const args = Array.prototype.slice.call(arguments);
          callApi(prop, args)
            .then(function (result) {
              if (typeof successHandler === 'function') successHandler(result);
            })
            .catch(function (error) {
              if (typeof failureHandler === 'function') failureHandler(error);
              else {
                console.error('Apps Script API error:', error);
                if (window.Swal) {
                  Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่สำเร็จ', text: error.message || String(error) });
                }
              }
            });
        };
      }
    });
  }

  window.apiCall = function (functionName) {
    const args = Array.prototype.slice.call(arguments, 1);
    return callApi(functionName, args);
  };

  window.getLocalPageUrl = getLocalPageUrl;
  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = createRunner(null, null);
})(window);
