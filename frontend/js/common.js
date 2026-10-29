(function () {
  var TOKEN_KEY = 'sfa_token';
  var USER_KEY = 'sfa_user';

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY));
    } catch (e) {
      return null;
    }
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function api(path, options) {
    options = options || {};
    var base = String(window.API_BASE_URL || '').replace(/\/+$/, '');
    var headers = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    var token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    var res;
    try {
      res = await fetch(base + path, {
        method: options.method || 'GET',
        headers: headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined
      });
    } catch (e) {
      throw new Error('Cannot reach the server. If it was idle, wait a minute and try again.');
    }

    var data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }

    if (!res.ok) {
      if (res.status === 401 && token) {
        clearSession();
        window.location.href = 'login.html';
      }
      var err = new Error((data && data.error) || 'Request failed (' + res.status + ').');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.className = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return node;
  }

  function money(value) {
    return Number(value).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function showMessage(container, type, text) {
    container.replaceChildren();
    if (!text) return;
    container.appendChild(el('div', { class: type === 'success' ? 'success' : 'error', text: text }));
  }

  function navLinks(user) {
    if (!user) {
      return [
        ['index.html', 'Home'],
        ['registration.html', 'Register'],
        ['login.html', 'Login'],
        ['find_medicine.html', 'Find Medicine'],
        ['pharmacies_map.html', 'Pharmacy Map']
      ];
    }
    var links = [['dashboard.html', 'Dashboard']];
    if (user.role === 'student') {
      links.push(['place_order.html', 'Order Now'], ['vieworders.html', 'Order History']);
    }
    if (user.role === 'kitchen') {
      links.push(['vieworders.html', 'Orders'], ['menumgmt.html', 'Menu Management']);
    }
    if (user.role === 'admin') {
      links.push(['manage_users.html', 'Manage Users'], ['settings.html', 'Settings']);
    }
    links.push(['find_medicine.html', 'Find Medicine'], ['pharmacies_map.html', 'Pharmacy Map']);
    links.push(['#logout', 'Logout']);
    return links;
  }

  function buildLayout() {
    var body = document.body;
    var user = getUser();
    var loggedIn = Boolean(user && getToken());

    if (body.dataset.auth === 'required') {
      if (!loggedIn) {
        window.location.replace('login.html');
        return false;
      }
      var roles = (body.dataset.roles || '').split(',').filter(Boolean);
      if (roles.length && roles.indexOf(user.role) === -1) {
        window.location.replace('dashboard.html');
        return false;
      }
    }

    var items = navLinks(loggedIn ? user : null).map(function (l) {
      var link = el('a', { href: l[0], text: l[1] });
      if (l[0] === '#logout') {
        link.addEventListener('click', function (e) {
          e.preventDefault();
          clearSession();
          window.location.href = 'index.html';
        });
      }
      return el('li', {}, [link]);
    });

    var header = el('header', { class: 'main-header' }, [
      el('h1', { text: 'Strathmore University Cafeteria Ordering System' }),
      el('nav', {}, [el('ul', {}, items)])
    ]);
    var footer = el('footer', { class: 'main-footer' }, [
      el('p', { text: '\u00A9 ' + new Date().getFullYear() + ' Strathmore University Cafeteria Ordering System. All rights reserved.' })
    ]);

    var h = document.getElementById('site-header');
    var f = document.getElementById('site-footer');
    if (h) h.replaceWith(header);
    if (f) f.replaceWith(footer);
    return true;
  }

  window.App = {
    api: api,
    el: el,
    money: money,
    showMessage: showMessage,
    getUser: getUser,
    getToken: getToken,
    setSession: setSession,
    clearSession: clearSession,
    ready: buildLayout()
  };
})();
