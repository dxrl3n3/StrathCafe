const USE_MOCK = process.env.PHARMALINK_MOCK !== 'false';
const BASE_URL = (process.env.PHARMALINK_BASE_URL || '').replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.PHARMALINK_TIMEOUT_MS || 5000);

function has(v) {
  return v !== undefined && v !== null && v !== '';
}

function pick(obj, keys, fallback = '') {
  if (!obj || typeof obj !== 'object') return fallback;
  for (const k of keys) {
    if (has(obj[k])) return obj[k];
  }
  return fallback;
}

function toNumberOrNull(v) {
  if (!has(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function unwrapList(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const k of ['data', 'items', 'results']) {
      if (Array.isArray(data[k])) return data[k];
    }
  }
  return [];
}

function unwrapOne(data) {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) return data.data;
    return data;
  }
  return {};
}

const normalizeMedicine = (r) => ({
  id: pick(r, ['id', 'medicineId', 'medicine_id']),
  name: String(pick(r, ['name', 'medicineName', 'medicine_name'], 'Medicine'))
});

const normalizeInventory = (r) => ({
  id: pick(r, ['id', 'inventoryId', 'inventory_id']),
  medicineId: pick(r, ['medicineId', 'medicine_id']),
  pharmacyId: pick(r, ['pharmacyId', 'pharmacy_id']),
  pharmacyName: String(pick(r, ['pharmacyName', 'pharmacy_name', 'name'], 'Pharmacy')),
  price: Number(pick(r, ['price', 'unitPrice', 'unit_price'], 0)),
  quantity: Number(pick(r, ['quantity', 'stock', 'availableQuantity'], 0))
});

const normalizePharmacy = (r) => ({
  id: pick(r, ['id', 'pharmacyId', 'pharmacy_id']),
  name: String(pick(r, ['name', 'pharmacyName', 'pharmacy_name'], 'Pharmacy')),
  address: String(pick(r, ['address', 'location'])),
  phone: String(pick(r, ['phone', 'phoneNumber', 'phone_number', 'contact'])),
  latitude: toNumberOrNull(pick(r, ['latitude', 'lat'], null)),
  longitude: toNumberOrNull(pick(r, ['longitude', 'lng', 'lon'], null))
});

let mockReservationId = 1000;

function mockResult(status, data, error = '') {
  return { ok: status >= 200 && status < 300, status, data, error };
}

function mockCall(method, pathWithQuery, body) {
  const medicines = [
    { id: 1, name: 'Paracetamol 500mg' },
    { id: 2, name: 'Amoxicillin 250mg' },
    { id: 3, name: 'Ibuprofen 400mg' }
  ];
  const pharmacies = [
    { id: 1, name: 'Campus Pharmacy', address: 'Ole Sangale Road, Nairobi', phone: '+254700000001', latitude: -1.3101, longitude: 36.8125 },
    { id: 2, name: 'Madaraka Chemist', address: 'Madaraka Estate, Nairobi', phone: '+254700000002', latitude: -1.305, longitude: 36.82 },
    { id: 3, name: 'Langata Road Pharmacy', address: 'Langata Road, Nairobi', phone: '+254700000003', latitude: -1.32, longitude: 36.805 }
  ];
  const inventory = [
    { id: 1, medicineId: 1, pharmacyId: 1, pharmacyName: 'Campus Pharmacy', price: 50, quantity: 20 },
    { id: 2, medicineId: 1, pharmacyId: 2, pharmacyName: 'Madaraka Chemist', price: 40, quantity: 5 },
    { id: 3, medicineId: 1, pharmacyId: 3, pharmacyName: 'Langata Road Pharmacy', price: 65, quantity: 0 },
    { id: 4, medicineId: 2, pharmacyId: 1, pharmacyName: 'Campus Pharmacy', price: 300, quantity: 8 },
    { id: 5, medicineId: 3, pharmacyId: 2, pharmacyName: 'Madaraka Chemist', price: 120, quantity: 12 }
  ];

  const url = new URL(pathWithQuery, 'http://mock.local');
  const parts = url.pathname.split('/').filter(Boolean);
  const resource = parts[0] || '';
  const id = parts[1];
  const byId = (list) => list.find((r) => String(r.id) === String(id));

  if (method === 'GET' && resource === 'medicines') {
    if (id !== undefined) {
      const row = byId(medicines);
      return row ? mockResult(200, row) : mockResult(404, null, 'Medicine not found.');
    }
    const name = (url.searchParams.get('name') || '').trim().toLowerCase();
    return mockResult(200, medicines.filter((m) => !name || m.name.toLowerCase().includes(name)));
  }

  if (method === 'GET' && resource === 'inventory') {
    if (id !== undefined) {
      const row = byId(inventory);
      return row ? mockResult(200, row) : mockResult(404, null, 'Inventory record not found.');
    }
    const medicineId = url.searchParams.get('medicineId');
    let rows = inventory.filter((r) => medicineId === null || String(r.medicineId) === String(medicineId));
    if (url.searchParams.get('sortBy') === 'price') rows = rows.slice().sort((a, b) => a.price - b.price);
    return mockResult(200, rows);
  }

  if (method === 'GET' && resource === 'pharmacies') {
    if (id !== undefined) {
      const row = byId(pharmacies);
      return row ? mockResult(200, row) : mockResult(404, null, 'Pharmacy not found.');
    }
    return mockResult(200, pharmacies);
  }

  if (method === 'POST' && resource === 'reservations') {
    if (!body || !body.inventoryId) return mockResult(400, null, 'inventoryId is required.');
    mockReservationId += 1;
    return mockResult(201, { id: mockReservationId, status: 'reserved' });
  }

  return mockResult(404, null, 'Unknown sample endpoint: ' + method + ' ' + pathWithQuery);
}

async function call(method, pathWithQuery, body) {
  if (USE_MOCK) return mockCall(method, pathWithQuery, body);

  if (!BASE_URL) {
    return { ok: false, status: 0, data: null, error: 'PHARMALINK_BASE_URL is not set on the server.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE_URL + pathWithQuery, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    const error = res.ok ? '' : String(pick(data, ['error', 'message'], 'PharmaLink returned status ' + res.status + '.'));
    return { ok: res.ok, status: res.status, data, error };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: 'Could not reach PharmaLink.' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  call,
  usingMock: USE_MOCK,
  unwrapList,
  unwrapOne,
  normalizeMedicine,
  normalizeInventory,
  normalizePharmacy
};
