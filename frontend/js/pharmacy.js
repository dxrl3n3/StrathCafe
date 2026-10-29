(function () {
  var App = window.App;
  if (!App || !App.ready) return;
  var el = App.el;
  var page = document.body.dataset.page;
  var slot = document.getElementById('message');

  function byId(id) {
    return document.getElementById(id);
  }

  var pages = {};

  pages.medicine = async function () {
    var params = new URLSearchParams(window.location.search);
    var q = (params.get('q') || '').trim();
    var medicineId = (params.get('medicineId') || '').trim();
    var holder = byId('results');
    var loggedIn = Boolean(App.getUser() && App.getToken());
    byId('q').value = q;

    async function showInventory() {
      var rows;
      try {
        rows = await App.api('/pharmalink/inventory?medicineId=' + encodeURIComponent(medicineId));
      } catch (err) {
        App.showMessage(slot, 'error', err.message);
        return;
      }
      holder.replaceChildren(
        el('h3', { text: 'Pharmacies with this medicine (lowest price first)' }),
        el('p', {}, [el('a', { href: 'find_medicine.html', text: 'Back to search' })])
      );
      if (!rows.length) {
        holder.appendChild(el('p', { text: 'No pharmacies currently list this medicine.' }));
        return;
      }

      var body = rows.map(function (r) {
        var actions = [];
        if (r.pharmacyId !== '') {
          actions.push(el('a', { class: 'btn-sm secondary', href: 'pharmacy_details.html?id=' + encodeURIComponent(r.pharmacyId), text: 'Details' }));
        }
        if (r.quantity > 0 && loggedIn) {
          var qty = el('input', { type: 'number', min: '1', max: String(r.quantity), value: '1', 'aria-label': 'Quantity' });
          var reserve = el('button', { type: 'button', class: 'btn-sm', text: 'Reserve for pickup' });
          reserve.addEventListener('click', async function () {
            var quantity = parseInt(qty.value, 10);
            if (!(quantity >= 1)) {
              App.showMessage(slot, 'error', 'Please choose a valid quantity.');
              return;
            }
            reserve.disabled = true;
            try {
              var result = await App.api('/pharmalink/reservations', { method: 'POST', body: { inventoryId: r.id, quantity: quantity } });
              var number = result.id ? ' Your reservation number is ' + result.id + '.' : '';
              App.showMessage(slot, 'success', 'Reservation created.' + number + ' Please collect it in person at the pharmacy.');
              showInventory();
            } catch (err) {
              App.showMessage(slot, 'error', err.message);
              reserve.disabled = false;
            }
          });
          actions.push(el('span', { class: 'inline-form' }, [qty, reserve]));
        } else if (r.quantity > 0) {
          actions.push(el('a', { class: 'btn-sm', href: 'login.html', text: 'Log in to reserve' }));
        }
        return el('tr', {}, [
          el('td', { text: r.pharmacyName }),
          el('td', { text: App.money(r.price) }),
          el('td', { text: r.quantity > 0 ? r.quantity : 'Out of stock' }),
          el('td', {}, [el('div', { class: 'inline-form' }, actions)])
        ]);
      });

      holder.appendChild(
        el('div', { class: 'table-wrap' }, [
          el('table', {}, [
            el('thead', {}, [el('tr', {}, ['Pharmacy', 'Price (Ksh)', 'In stock', 'Actions'].map(function (h) { return el('th', { text: h }); }))]),
            el('tbody', {}, body)
          ])
        ])
      );
    }

    if (medicineId) {
      showInventory();
    } else if (q) {
      try {
        var medicines = await App.api('/pharmalink/medicines?name=' + encodeURIComponent(q));
        if (!medicines.length) {
          holder.appendChild(el('p', { text: 'No medicines found for "' + q + '".' }));
          return;
        }
        holder.appendChild(el('h3', { text: 'Results' }));
        holder.appendChild(
          el('ul', { class: 'plain' }, medicines.map(function (m) {
            return el('li', {}, [m.name + ' - ', el('a', { href: 'find_medicine.html?medicineId=' + encodeURIComponent(m.id), text: 'View prices and stock' })]);
          }))
        );
      } catch (err) {
        App.showMessage(slot, 'error', err.message);
      }
    }
  };

  pages.map = async function () {
    var holder = byId('map-holder');
    var pharmacies;
    try {
      pharmacies = await App.api('/pharmalink/pharmacies');
    } catch (err) {
      App.showMessage(slot, 'error', err.message);
      return;
    }
    var located = pharmacies.filter(function (p) {
      return p.latitude !== null && p.longitude !== null;
    });
    if (!located.length) {
      holder.appendChild(el('p', { text: 'No pharmacies with map coordinates were found.' }));
      return;
    }

    if (typeof window.L === 'undefined') {
      App.showMessage(slot, 'error', 'The map library could not load. Check your internet connection and refresh.');
    } else {
      var mapBox = el('div', { id: 'pl-map', class: 'map-box' });
      holder.appendChild(mapBox);
      var map = window.L.map(mapBox).setView([located[0].latitude, located[0].longitude], 13);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
      var bounds = [];
      located.forEach(function (p) {
        var popup = el('div', {}, [el('strong', { text: p.name })]);
        if (p.address) popup.appendChild(el('div', { text: p.address }));
        if (p.id !== '') popup.appendChild(el('a', { href: 'pharmacy_details.html?id=' + encodeURIComponent(p.id), text: 'Call / Directions' }));
        window.L.marker([p.latitude, p.longitude]).addTo(map).bindPopup(popup);
        bounds.push([p.latitude, p.longitude]);
      });
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30] });
    }

    holder.appendChild(el('h3', { text: 'Pharmacies' }));
    holder.appendChild(
      el('ul', { class: 'plain' }, pharmacies.map(function (p) {
        var item = el('li', {}, [p.name]);
        if (p.id !== '') item.appendChild(el('span', {}, [' - ', el('a', { href: 'pharmacy_details.html?id=' + encodeURIComponent(p.id), text: 'Call / Directions' })]));
        return item;
      }))
    );
  };

  pages.pharmacy = async function () {
    var id = (new URLSearchParams(window.location.search).get('id') || '').trim();
    var holder = byId('pharmacy-holder');
    if (!id) {
      App.showMessage(slot, 'error', 'No pharmacy selected.');
      return;
    }
    var p;
    try {
      p = await App.api('/pharmalink/pharmacies/' + encodeURIComponent(id));
    } catch (err) {
      App.showMessage(slot, 'error', err.message);
      return;
    }
    holder.appendChild(el('h3', { text: p.name }));
    holder.appendChild(el('p', {}, [el('strong', { text: 'Address: ' }), p.address || 'Not available']));
    holder.appendChild(el('p', {}, [el('strong', { text: 'Phone: ' }), p.phone || 'Not available']));

    var actions = el('div', { class: 'page-actions' });
    var phone = p.phone.replace(/[^0-9+]/g, '');
    if (phone) actions.appendChild(el('a', { class: 'btn-sm', href: 'tel:' + phone, text: 'Call' }));
    var destination = '';
    if (p.latitude !== null && p.longitude !== null) destination = p.latitude + ',' + p.longitude;
    else if (p.address) destination = p.address;
    if (destination) {
      actions.appendChild(
        el('a', {
          class: 'btn-sm',
          href: 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(destination),
          target: '_blank',
          rel: 'noopener noreferrer',
          text: 'Directions'
        })
      );
    }
    actions.appendChild(el('a', { class: 'btn-sm secondary', href: 'pharmacies_map.html', text: 'Back to map' }));
    holder.appendChild(actions);
  };

  if (pages[page]) pages[page]();
})();
