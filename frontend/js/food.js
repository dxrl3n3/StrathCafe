(function () {
  var App = window.App;
  if (!App || !App.ready) return;
  var el = App.el;
  var page = document.body.dataset.page;
  var slot = document.getElementById('message');

  function byId(id) {
    return document.getElementById(id);
  }

  function ucfirst(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  function formatDate(value) {
    var d = new Date(value);
    return isNaN(d.getTime()) ? '' : d.toLocaleString();
  }

  function card(title, description, href, buttonText) {
    var children = [el('h3', { text: title }), el('p', { text: description })];
    if (href) children.push(el('a', { href: href, class: 'cta-button', text: buttonText }));
    return el('div', { class: 'feature' }, children);
  }

  var pages = {};

  pages.dashboard = function () {
    var user = App.getUser();
    byId('welcome').textContent = 'Welcome, ' + user.fullname + '!';

    var profile = el('div', { class: 'feature' }, [
      el('h3', { text: 'Your Profile' }),
      el('p', {}, [el('strong', { text: 'Name: ' }), user.fullname]),
      el('p', {}, [el('strong', { text: 'Email: ' }), user.email]),
      el('p', {}, [el('strong', { text: 'Role: ' }), ucfirst(user.role)])
    ]);
    var cards = [profile];

    if (user.role === 'student') {
      cards.push(card('Place Order', 'Browse our menu and place your food orders.', 'place_order.html', 'Order Now'));
      cards.push(card('Order History', 'View your previous orders and track current ones.', 'vieworders.html', 'Order History'));
    }
    if (user.role === 'admin') {
      cards.push(card('Manage Users', 'View and manage system users.', 'manage_users.html', 'Manage Users'));
      cards.push(card('System Settings', 'Configure system settings and preferences.', 'settings.html', 'Settings'));
    }
    if (user.role === 'kitchen') {
      cards.push(card('Pending Orders', 'View and process incoming food orders.', 'vieworders.html', 'View Orders'));
      cards.push(card('Menu Management', 'Update menu items and availability.', 'menumgmt.html', 'Manage Menu'));
    }
    cards.push(card('Find Medicine', 'Search for a medicine and compare prices at nearby pharmacies.', 'find_medicine.html', 'Find Medicine'));
    cards.push(card('Pharmacy Map', 'See pharmacies on a map, with phone numbers and directions.', 'pharmacies_map.html', 'Open Map'));

    byId('cards').replaceChildren.apply(byId('cards'), cards);
  };

  pages.order = async function () {
    var select = byId('menu_id');
    var qty = byId('quantity');
    var form = byId('orderForm');
    var button = form.querySelector('button[type="submit"]');

    try {
      var items = await App.api('/menu');
      items.forEach(function (item) {
        var label = item.name + ' - Ksh ' + item.price + ' (' + (item.available ? 'Available \u2705' : 'Unavailable \u274C') + ')';
        select.appendChild(el('option', { value: item.id, 'data-price': item.price, disabled: !item.available, text: label }));
      });
    } catch (err) {
      App.showMessage(slot, 'error', err.message);
      return;
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var option = select.options[select.selectedIndex];
      var quantity = parseInt(qty.value, 10);
      if (!select.value) {
        App.showMessage(slot, 'error', 'Please select a menu item.');
        return;
      }
      if (!(quantity >= 1)) {
        App.showMessage(slot, 'error', 'Quantity must be at least 1.');
        return;
      }
      var total = parseFloat(option.getAttribute('data-price')) * quantity;
      if (!window.confirm('You are about to place an order worth Ksh ' + total.toFixed(2) + '.\nContinue and pay now?')) return;

      button.disabled = true;
      try {
        var order = await App.api('/orders', { method: 'POST', body: { menuId: Number(select.value), quantity: quantity } });
        App.showMessage(slot, 'success', '\u2705 Order placed for ' + order.item + '. Please pay Ksh ' + App.money(order.totalPrice) + '.');
        qty.value = 1;
      } catch (err) {
        App.showMessage(slot, 'error', '\u274C ' + err.message);
      }
      button.disabled = false;
    });
  };

  pages.orders = async function () {
    var user = App.getUser();
    var kitchen = user.role === 'kitchen';
    byId('orders-title').textContent = kitchen ? 'Kitchen: All Orders' : 'My Orders';
    var holder = byId('orders-holder');

    async function load() {
      var orders;
      try {
        orders = await App.api('/orders');
      } catch (err) {
        App.showMessage(slot, 'error', err.message);
        return;
      }
      holder.replaceChildren();
      if (!orders.length) {
        holder.appendChild(el('p', { class: 'error', text: kitchen ? 'No orders found.' : 'You haven\u2019t placed any orders yet.' }));
        return;
      }

      var head = ['#'];
      if (kitchen) head.push('Student');
      head.push('Item', 'Qty', 'Total (Ksh)', 'Status');
      if (kitchen) head.push('Action');
      head.push('Ordered At');

      var rows = orders.map(function (o, i) {
        var cells = [el('td', { text: i + 1 })];
        if (kitchen) cells.push(el('td', { text: o.student }));
        cells.push(el('td', { text: o.item }), el('td', { text: o.quantity }), el('td', { text: App.money(o.totalPrice) }));
        cells.push(el('td', { class: 'status-' + o.status, text: ucfirst(o.status) }));
        if (kitchen) {
          var action = el('td');
          if (o.status === 'pending') {
            action.appendChild(
              el('button', {
                type: 'button',
                class: 'btn-sm',
                text: 'Mark Delivered',
                onclick: async function (e) {
                  e.target.disabled = true;
                  try {
                    await App.api('/orders/' + o.id + '/status', { method: 'PUT', body: { status: 'delivered' } });
                    load();
                  } catch (err) {
                    App.showMessage(slot, 'error', err.message);
                    e.target.disabled = false;
                  }
                }
              })
            );
          } else {
            action.textContent = '\u2014';
          }
          cells.push(action);
        }
        cells.push(el('td', { text: formatDate(o.orderTime) }));
        return el('tr', {}, cells);
      });

      holder.appendChild(
        el('div', { class: 'table-wrap' }, [
          el('table', { class: 'orders-table' }, [
            el('thead', {}, [el('tr', {}, head.map(function (h) { return el('th', { text: h }); }))]),
            el('tbody', {}, rows)
          ])
        ])
      );
    }
    load();
  };

  pages.users = function () {
    var holder = byId('users-holder');
    var searchInput = byId('search');
    var statusSelect = byId('status-filter');

    async function load() {
      var qs = '?search=' + encodeURIComponent(searchInput.value.trim()) + '&status=' + encodeURIComponent(statusSelect.value);
      var users;
      try {
        users = await App.api('/users' + qs);
      } catch (err) {
        App.showMessage(slot, 'error', err.message);
        return;
      }
      holder.replaceChildren();
      if (!users.length) {
        holder.appendChild(el('p', { text: 'No users found.' }));
        return;
      }

      async function act(method, path, body, okText) {
        try {
          var result = await App.api(path, { method: method, body: body });
          App.showMessage(slot, 'success', (result && result.message) || okText);
        } catch (err) {
          App.showMessage(slot, 'error', err.message);
        }
        load();
      }

      var rows = users.map(function (u) {
        var roleSelect = el(
          'select',
          {},
          ['student', 'admin', 'kitchen'].map(function (r) {
            return el('option', { value: r, selected: u.role === r, text: ucfirst(r) });
          })
        );
        var buttons = [
          el('button', { type: 'button', class: 'btn-sm', text: 'Update', onclick: function () { act('PUT', '/users/' + u.id + '/role', { role: roleSelect.value }, 'Role updated.'); } })
        ];
        if (u.status === 'active') {
          buttons.push(el('button', { type: 'button', class: 'btn-sm secondary', text: 'Disable', onclick: function () {
            if (window.confirm('Are you sure you want to disable this user?')) act('PUT', '/users/' + u.id + '/status', { status: 'inactive' }, 'User disabled.');
          } }));
        } else {
          buttons.push(el('button', { type: 'button', class: 'btn-sm secondary', text: 'Enable', onclick: function () {
            if (window.confirm('Are you sure you want to re-enable this user?')) act('PUT', '/users/' + u.id + '/status', { status: 'active' }, 'User enabled.');
          } }));
        }
        buttons.push(el('button', { type: 'button', class: 'btn-sm danger', text: 'Delete', onclick: function () {
          if (window.confirm('Are you sure you want to delete this user?')) act('DELETE', '/users/' + u.id, undefined, 'User deleted.');
        } }));

        return el('tr', {}, [
          el('td', { text: u.id }),
          el('td', { text: u.fullname }),
          el('td', { text: u.email }),
          el('td', {}, [roleSelect]),
          el('td', { text: ucfirst(u.status) }),
          el('td', { text: formatDate(u.registrationDate) }),
          el('td', {}, [el('div', { class: 'inline-form' }, buttons)])
        ]);
      });

      holder.appendChild(
        el('div', { class: 'table-wrap' }, [
          el('table', {}, [
            el('thead', {}, [el('tr', {}, ['#', 'Full Name', 'Email', 'Role', 'Status', 'Registered On', 'Actions'].map(function (h) { return el('th', { text: h }); }))]),
            el('tbody', {}, rows)
          ])
        ])
      );
    }

    byId('users-search-form').addEventListener('submit', function (e) {
      e.preventDefault();
      load();
    });
    load();
  };

  pages.menu = async function () {
    var holder = byId('menu-holder');
    var items;
    try {
      items = await App.api('/menu');
    } catch (err) {
      App.showMessage(slot, 'error', err.message);
      return;
    }
    var rows = items.map(function (item) {
      var price = el('input', { type: 'number', step: '0.01', min: '0', value: item.price, required: true });
      var availability = el('select', {}, [
        el('option', { value: 'available', selected: item.available, text: 'Available' }),
        el('option', { value: 'unavailable', selected: !item.available, text: 'Unavailable' })
      ]);
      return { id: item.id, price: price, availability: availability, row: el('tr', {}, [el('td', { text: item.name }), el('td', {}, [price]), el('td', {}, [availability])]) };
    });
    holder.appendChild(
      el('div', { class: 'table-wrap' }, [
        el('table', {}, [
          el('thead', {}, [el('tr', {}, ['Item', 'Price (Ksh)', 'Availability'].map(function (h) { return el('th', { text: h }); }))]),
          el('tbody', {}, rows.map(function (r) { return r.row; }))
        ])
      ])
    );

    byId('menu-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var payload = rows.map(function (r) {
        return { id: r.id, price: Number(r.price.value), available: r.availability.value === 'available' };
      });
      try {
        var result = await App.api('/menu', { method: 'PUT', body: { items: payload } });
        App.showMessage(slot, 'success', result.message);
      } catch (err) {
        App.showMessage(slot, 'error', err.message);
      }
    });
  };

  pages.settings = function () {
    var defaults = { default_availability: true, maintenance_mode: false, support_email: 'cafeteria@strathmore.edu' };
    var saved = {};
    try {
      saved = JSON.parse(localStorage.getItem('sfa_settings')) || {};
    } catch (e) {
      saved = {};
    }
    var s = Object.assign({}, defaults, saved);
    byId('default_availability').checked = Boolean(s.default_availability);
    byId('maintenance_mode').checked = Boolean(s.maintenance_mode);
    byId('support_email').value = s.support_email;

    byId('settings-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var next = {
        default_availability: byId('default_availability').checked,
        maintenance_mode: byId('maintenance_mode').checked,
        support_email: byId('support_email').value.trim()
      };
      try {
        localStorage.setItem('sfa_settings', JSON.stringify(next));
      } catch (err) {
        App.showMessage(slot, 'error', 'Could not save settings in this browser.');
        return;
      }
      App.showMessage(slot, 'success', 'Settings updated successfully.');
    });
  };

  if (pages[page]) pages[page]();
})();
