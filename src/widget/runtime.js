/*! FlyRank embeddable widget runtime. Loaded once per page (cached, versioned), shared by
 *  every widget embed.js on that page. Renders into a Shadow DOM so the host page's CSS
 *  can't break it and ours can't leak out. Every server-provided string is set with
 *  textContent — never innerHTML — so a malicious widget title can't inject a script. */
(function () {
  'use strict';
  if (window.__flyrankRuntimeLoaded) return;
  window.__flyrankRuntimeLoaded = true;

  function el(tag, props, children) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) { if (k === 'text') n.textContent = props[k]; else n.setAttribute(k, props[k]); });
    (children || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }
  function uuid() { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12); }

  var CSS = ':host{all:initial;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111}' +
    '.box{box-sizing:border-box;max-width:420px;padding:20px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,.08)}' +
    'h3{margin:0 0 6px;font-size:18px}p.d{margin:0 0 14px;color:#4b5563;font-size:14px}' +
    'label{display:block;margin:10px 0 4px;font-size:13px;font-weight:600}' +
    'input[type=text],input[type=email],textarea{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font:inherit}' +
    'button.go{margin-top:16px;width:100%;padding:10px;border:0;border-radius:8px;color:#fff;background:#2563eb;font:inherit;font-weight:600;cursor:pointer}' +
    'button.go[disabled]{opacity:.6;cursor:wait}' +
    '.err{color:#b91c1c;font-size:12px;margin-top:3px}.msg{margin-top:12px;font-size:14px}.msg.ok{color:#047857}.msg.bad{color:#b91c1c}' +
    '.hp{position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden}';

  function request(method, path, body, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, window.__flyrankApiBase + path);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Idempotency-Key', uuid());
    xhr.onload = function () { var json = null; try { json = JSON.parse(xhr.responseText); } catch (e) {} cb(null, xhr.status, json); };
    xhr.onerror = function () { cb(new Error('network')); };
    xhr.send(JSON.stringify(body));
  }

  window.__flyrankRender = function (widgetId) {
    var cfg = (window.__flyrankWidgetConfig || {})[widgetId];
    if (!cfg) { console.error('[flyrank-widget] no config loaded for ' + widgetId); return; }
    var host = el('div', { 'data-flyrank-widget': widgetId });
    var mountAfter = document.querySelector('script[data-flyrank-mount="' + widgetId + '"]');
    if (mountAfter) mountAfter.parentNode.insertBefore(host, mountAfter.nextSibling);
    else document.currentScript ? document.currentScript.parentNode.insertBefore(host, document.currentScript.nextSibling) : document.body.appendChild(host);

    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var style = el('style'); style.textContent = CSS; root.appendChild(style);
    var box = el('div', { class: 'box' });
    root.appendChild(box);

    box.appendChild(el('h3', { text: cfg.title }));
    if (cfg.description) box.appendChild(el('p', { class: 'd', text: cfg.description }));

    var form = el('form', { novalidate: 'novalidate' });
    var inputs = {}; var errBoxes = {};
    (cfg.fields || []).forEach(function (f) {
      var wrap = el('div');
      var input = f.type === 'textarea' ? el('textarea', { rows: '4' }) : el('input', { type: f.type === 'email' ? 'email' : 'text' });
      input.id = 'f_' + widgetId + '_' + f.name;
      inputs[f.name] = { el: input, def: f };
      wrap.appendChild(el('label', { for: input.id, text: f.label + (f.required ? ' *' : '') }));
      wrap.appendChild(input);
      errBoxes[f.name] = el('div', { class: 'err' });
      wrap.appendChild(errBoxes[f.name]);
      form.appendChild(wrap);
    });
    var hp = el('input', { type: 'text', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    form.appendChild(el('div', { class: 'hp', 'aria-hidden': 'true' }, [hp]));
    var btn = el('button', { type: 'submit', class: 'go', text: cfg.buttonText || 'Submit' });
    var msg = el('div', { class: 'msg', role: 'status' });
    form.appendChild(btn); form.appendChild(msg);
    box.appendChild(form);

    function say(text, ok) { msg.textContent = text; msg.className = 'msg ' + (ok ? 'ok' : 'bad'); }
    function clearErrors() { Object.keys(errBoxes).forEach(function (k) { errBoxes[k].textContent = ''; }); msg.textContent = ''; msg.className = 'msg'; }

    form.addEventListener('submit', function (e) {
      e.preventDefault(); clearErrors();
      var data = {};
      Object.keys(inputs).forEach(function (name) { data[name] = inputs[name].el.value; });
      data[hp.name || 'website'] = hp.value; // honeypot: field name intentionally not in cfg.fields
      btn.disabled = true;
      request('POST', '/widgets/' + widgetId + '/submissions', data, function (err, status, json) {
        btn.disabled = false;
        if (err) return say('Network problem — please try again.', false);
        if (status === 201 || status === 200) { say('Thanks! We received your submission.', true); form.reset(); return; }
        if (status === 422 && json && json.error && json.error.details) {
          json.error.details.forEach(function (d) { if (errBoxes[d.field]) errBoxes[d.field].textContent = d.message; });
          return say('Please fix the highlighted fields.', false);
        }
        if (status === 429) return say('Too many attempts — please wait a moment.', false);
        say('Something went wrong. Please try again later.', false);
      });
    });
  };
})();
