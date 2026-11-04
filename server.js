const express = require('express');
const fs = require('fs');
const path = require('path');

const ITEM_TYPES = ['food', 'medicine'];
const STATUSES = ['pending', 'fulfilled', 'cancelled'];
const MAX_QUANTITY = 100;

function seedData() {
  return {
    nextOrderNumber: 5002,
    menu: [
      { itemId: 'food-1', itemType: 'food', name: 'Chicken Pilau', price: 350, available: true },
      { itemId: 'food-2', itemType: 'food', name: 'Masala Chips', price: 250, available: true },
      { itemId: 'food-3', itemType: 'food', name: 'Beef Samosa (2pcs)', price: 120, available: true },
      { itemId: 'med-101', itemType: 'medicine', name: 'Paracetamol 500mg (strip)', price: 50, available: true },
      { itemId: 'med-102', itemType: 'medicine', name: 'Ibuprofen 400mg (strip)', price: 120, available: true },
      { itemId: 'med-103', itemType: 'medicine', name: 'Oral Rehydration Salts', price: 60, available: true },
      { itemId: 'med-104', itemType: 'medicine', name: 'Amoxicillin 250mg (strip)', price: 300, available: false }
    ],
    orders: [
      {
        id: 'ord-5001',
        studentId: 'std-8842',
        items: [{ itemId: 'med-101', itemType: 'medicine', name: 'Paracetamol 500mg (strip)', quantity: 2, unitPrice: 50 }],
        status: 'pending',
        total: 100,
        createdAt: '2026-11-01T08:00:00.000Z',
        updatedAt: '2026-11-01T08:00:00.000Z'
      }
    ]
  };
}

function loadStore(dataFile) {
  if (dataFile && fs.existsSync(dataFile)) {
    try {
      return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    } catch (err) {
      console.warn('Could not read ' + dataFile + ', starting from the seed data.');
    }
  }
  return seedData();
}

function saveStore(store, dataFile) {
  if (dataFile) {
    fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isMissing(value) {
  return value === undefined || value === null;
}

function validateNewOrder(body, menu) {
  if (!isPlainObject(body)) {
    return { error: 'Request body must be a JSON object with studentId and items' };
  }

  const missing = ['studentId', 'items'].filter((f) => isMissing(body[f]));
  if (missing.length) {
    return { error: missing.join(' and ') + (missing.length > 1 ? ' are required' : ' is required') };
  }

  if (typeof body.studentId !== 'string') return { error: 'studentId must be a string' };
  if (body.studentId.trim().length === 0) return { error: 'studentId must not be empty' };
  if (body.studentId.trim().length > 50) return { error: 'studentId must be 50 characters or fewer' };

  if (!Array.isArray(body.items)) return { error: 'items must be an array' };
  if (body.items.length === 0) return { error: 'items must contain at least one item' };

  const lines = [];
  for (let i = 0; i < body.items.length; i++) {
    const item = body.items[i];
    const at = 'items[' + i + ']';

    if (!isPlainObject(item)) return { error: at + ' must be an object' };

    const missingFields = ['itemId', 'itemType', 'quantity'].filter((f) => isMissing(item[f]));
    if (missingFields.length) {
      return { error: at + ' is missing required field(s): ' + missingFields.join(', ') };
    }

    if (typeof item.itemId !== 'string') return { error: at + '.itemId must be a string' };
    if (item.itemId.trim().length === 0) return { error: at + '.itemId must not be empty' };

    if (typeof item.itemType !== 'string' || !ITEM_TYPES.includes(item.itemType)) {
      return { error: at + '.itemType must be one of: ' + ITEM_TYPES.join(', ') };
    }

    if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity)) {
      return { error: at + '.quantity must be an integer' };
    }
    if (item.quantity < 1 || item.quantity > MAX_QUANTITY) {
      return { error: at + '.quantity must be between 1 and ' + MAX_QUANTITY };
    }

    const entry = menu.find((m) => m.itemId === item.itemId);
    if (!entry) return { error: at + '.itemId \'' + item.itemId + '\' is not on the menu' };
    if (entry.itemType !== item.itemType) {
      return { error: at + ': \'' + item.itemId + '\' is a ' + entry.itemType + ' item, not ' + item.itemType };
    }
    if (!entry.available) return { error: at + ': \'' + item.itemId + '\' is not currently available' };

    lines.push({
      itemId: entry.itemId,
      itemType: entry.itemType,
      name: entry.name,
      quantity: item.quantity,
      unitPrice: entry.price
    });
  }

  return { value: { studentId: body.studentId.trim(), lines: lines } };
}

function validateStatusUpdate(body) {
  if (!isPlainObject(body)) return { error: 'Request body must be a JSON object with a status field' };
  if (isMissing(body.status)) return { error: 'status is required' };
  if (typeof body.status !== 'string') return { error: 'status must be a string' };
  if (!STATUSES.includes(body.status)) return { error: 'status must be one of: ' + STATUSES.join(', ') };
  return { value: body.status };
}

function createApp(dataFile) {
  const store = loadStore(dataFile);
  const app = express();
  app.use(express.json());

  app.get('/cafeteria/menu', (req, res) => {
    const available = store.menu
      .filter((m) => m.available)
      .map((m) => ({ itemId: m.itemId, itemType: m.itemType, name: m.name, price: m.price }));
    res.status(200).json(available);
  });

  app.post('/cafeteria/orders', (req, res) => {
    const result = validateNewOrder(req.body, store.menu);
    if (result.error) {
      return res.status(400).json({ message: result.error });
    }

    const total = result.value.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    const now = new Date().toISOString();
    const order = {
      id: 'ord-' + store.nextOrderNumber,
      studentId: result.value.studentId,
      items: result.value.lines,
      status: 'pending',
      total: total,
      createdAt: now,
      updatedAt: now
    };

    store.nextOrderNumber += 1;
    store.orders.push(order);
    saveStore(store, dataFile);

    res.status(201).location('/cafeteria/orders/' + order.id).json(order);
  });

  app.get('/cafeteria/orders/:id', (req, res) => {
    const order = store.orders.find((o) => o.id === req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order ' + req.params.id + ' not found' });
    }
    res.status(200).json(order);
  });

  app.patch('/cafeteria/orders/:id', (req, res) => {
    const result = validateStatusUpdate(req.body);
    if (result.error) {
      return res.status(400).json({ message: result.error });
    }

    const order = store.orders.find((o) => o.id === req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order ' + req.params.id + ' not found' });
    }

    if (order.status !== result.value) {
      order.status = result.value;
      order.updatedAt = new Date().toISOString();
      saveStore(store, dataFile);
    }

    res.status(200).json(order);
  });

  app.get('/cafeteria/students/:studentId/orders', (req, res) => {
    const orders = store.orders.filter((o) => o.studentId === req.params.studentId);
    res.status(200).json(orders);
  });

  app.get('/openapi.yaml', (req, res) => {
    res.sendFile(path.join(__dirname, 'openapi.yaml'));
  });

  app.get('/docs', (req, res) => {
    res.type('html').send(
      '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
        '<title>Strathmore Cafeteria API docs</title>' +
        '<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css"></head>' +
        '<body><div id="swagger-ui"></div>' +
        '<script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>' +
        '<script>SwaggerUIBundle({ url: \'/openapi.yaml\', dom_id: \'#swagger-ui\' });</script>' +
        '</body></html>'
    );
  });

  app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
  });

  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ message: 'Request body is not valid JSON' });
    }
    console.error(err);
    res.status(500).json({ message: 'Something went wrong on the server' });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3001);
  const app = createApp(path.join(__dirname, 'data.json'));
  app.listen(port, () => {
    console.log('Cafeteria API running at http://localhost:' + port);
    console.log('API docs (Swagger UI) at http://localhost:' + port + '/docs');
  });
}

module.exports = { createApp };
