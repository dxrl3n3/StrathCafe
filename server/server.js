require('dotenv').config();

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set. Add it to your .env file (or Render environment settings).');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { signToken, auth, requireRole } = require('./middleware');
const pl = require('./pharmalink');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROLES = ['student', 'admin', 'kitchen'];

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : '*'
  })
);
app.use(express.json());

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
}

function publicUser(row) {
  return { id: row.id, fullname: row.fullname, email: row.email, role: row.role };
}

app.get('/', (req, res) => {
  res.json({ name: 'Strathmore Cafeteria API', status: 'running' });
});

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', pharmalinkMock: pl.usingMock });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'unreachable' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const body = req.body || {};
  const fullname = String(body.fullname || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const confirmPassword = body.confirmPassword === undefined ? password : String(body.confirmPassword);
  const role = String(body.role || '');

  const errors = [];
  if (!fullname) errors.push('Full name is required');
  if (fullname.length > 100) errors.push('Full name is too long');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100) errors.push('Valid email is required');
  if (password.length < 8) errors.push('Password must be at least 8 characters long');
  if (password !== confirmPassword) errors.push('Passwords do not match');
  if (!ROLES.includes(role)) errors.push('Invalid role selected');
  if (role === 'admin' && !email.endsWith('@strathmore.edu')) errors.push('Only Strathmore emails can register as Admin.');
  if (role === 'kitchen' && !email.endsWith('@strathmore.edu')) errors.push('Only Strathmore emails can register as Staff.');

  if (errors.length) return res.status(400).json({ error: errors.join('. ') + '.' });

  const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) {
    return res.status(409).json({ error: 'Email already registered. Please use a different email.' });
  }

  const hash = bcrypt.hashSync(password, 10).replace(/^\$2[ab]\$/, '$2y$');
  await db.query('INSERT INTO users (fullname, email, password, role) VALUES (?, ?, ?, ?)', [fullname, email, hash, role]);
  res.status(201).json({ message: 'Registration successful! You can now log in.' });
});

app.post('/api/auth/login', async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const password = String((req.body && req.body.password) || '');
  if (!email || !password) return res.status(400).json({ error: 'Please fill in all fields' });

  const [rows] = await db.query('SELECT id, fullname, email, password, role, status FROM users WHERE email = ?', [email]);
  const user = rows[0];
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (user.status === 'inactive') {
    return res.status(403).json({ error: 'This account has been disabled. Contact an administrator.' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get('/api/auth/me', auth, async (req, res) => {
  const [rows] = await db.query('SELECT id, fullname, email, role FROM users WHERE id = ?', [req.user.id]);
  if (!rows.length) return res.status(401).json({ error: 'Account no longer exists.' });
  res.json(publicUser(rows[0]));
});

app.get('/api/menu', async (req, res) => {
  const [rows] = await db.query('SELECT id, name, price, available FROM menu ORDER BY name ASC');
  res.json(rows.map((r) => ({ id: r.id, name: r.name, price: r.price, available: Boolean(r.available) })));
});

app.put('/api/menu', auth, requireRole('kitchen'), async (req, res) => {
  const items = req.body && req.body.items;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'No menu items were sent.' });

  for (const item of items) {
    const id = toInt(item.id);
    const price = Number(item.price);
    if (Number.isNaN(id) || !Number.isFinite(price) || price < 0 || typeof item.available !== 'boolean') {
      return res.status(400).json({ error: 'Each item needs a valid id, price and availability.' });
    }
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const item of items) {
      await conn.query('UPDATE menu SET price = ?, available = ? WHERE id = ?', [Number(item.price), item.available ? 1 : 0, toInt(item.id)]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  res.json({ message: 'Menu updated successfully.' });
});

app.post('/api/orders', auth, requireRole('student'), async (req, res) => {
  const menuId = toInt(req.body && req.body.menuId);
  const quantity = toInt(req.body && req.body.quantity);
  if (Number.isNaN(menuId)) return res.status(400).json({ error: 'Please select a menu item.' });
  if (Number.isNaN(quantity) || quantity < 1 || quantity > 100) {
    return res.status(400).json({ error: 'Quantity must be a whole number between 1 and 100.' });
  }

  const [rows] = await db.query('SELECT name, price, available FROM menu WHERE id = ?', [menuId]);
  const item = rows[0];
  if (!item || !item.available) return res.status(400).json({ error: 'The selected item is not available.' });

  const totalPrice = Math.round(item.price * quantity * 100) / 100;
  const [result] = await db.query('INSERT INTO orders (user_id, menu_id, quantity, total_price) VALUES (?, ?, ?, ?)', [
    req.user.id,
    menuId,
    quantity,
    totalPrice
  ]);
  res.status(201).json({ id: result.insertId, item: item.name, quantity, totalPrice });
});

app.get('/api/orders', auth, requireRole('student', 'kitchen'), async (req, res) => {
  let rows;
  if (req.user.role === 'student') {
    [rows] = await db.query(
      `SELECT o.id, m.name AS item, o.quantity, o.total_price, o.status, o.order_time
       FROM orders o JOIN menu m ON o.menu_id = m.id
       WHERE o.user_id = ? ORDER BY o.order_time DESC, o.id DESC`,
      [req.user.id]
    );
  } else {
    [rows] = await db.query(
      `SELECT o.id, u.fullname AS student, m.name AS item, o.quantity, o.total_price, o.status, o.order_time
       FROM orders o JOIN users u ON o.user_id = u.id JOIN menu m ON o.menu_id = m.id
       ORDER BY o.order_time DESC, o.id DESC`
    );
  }
  res.json(
    rows.map((r) => ({
      id: r.id,
      student: r.student,
      item: r.item,
      quantity: r.quantity,
      totalPrice: r.total_price,
      status: r.status,
      orderTime: r.order_time
    }))
  );
});

app.put('/api/orders/:id/status', auth, requireRole('kitchen'), async (req, res) => {
  const id = toInt(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid order id.' });
  if (!req.body || req.body.status !== 'delivered') {
    return res.status(400).json({ error: "Status must be 'delivered'." });
  }
  const [result] = await db.query('UPDATE orders SET status = ? WHERE id = ?', ['delivered', id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Order not found.' });
  res.json({ message: 'Order marked as delivered.' });
});

app.get('/api/users', auth, requireRole('admin'), async (req, res) => {
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '');
  let sql = 'SELECT id, fullname, email, role, status, registration_date FROM users WHERE 1';
  const params = [];
  if (search) {
    sql += ' AND (fullname LIKE ? OR email LIKE ?)';
    params.push('%' + search + '%', '%' + search + '%');
  }
  if (status === 'active' || status === 'inactive') {
    sql += ' AND status = ?';
    params.push(status);
  }
  sql += ' ORDER BY id ASC';
  const [rows] = await db.query(sql, params);
  res.json(
    rows.map((r) => ({
      id: r.id,
      fullname: r.fullname,
      email: r.email,
      role: r.role,
      status: r.status,
      registrationDate: r.registration_date
    }))
  );
});

app.put('/api/users/:id/role', auth, requireRole('admin'), async (req, res) => {
  const id = toInt(req.params.id);
  const role = req.body && req.body.role;
  if (Number.isNaN(id) || !ROLES.includes(role)) return res.status(400).json({ error: 'Invalid user or role.' });
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot change your own role.' });
  const [result] = await db.query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'User not found.' });
  res.json({ message: 'Role updated.' });
});

app.put('/api/users/:id/status', auth, requireRole('admin'), async (req, res) => {
  const id = toInt(req.params.id);
  const status = req.body && req.body.status;
  if (Number.isNaN(id) || !['active', 'inactive'].includes(status)) {
    return res.status(400).json({ error: 'Invalid user or status.' });
  }
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot disable your own account.' });
  const [result] = await db.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'User not found.' });
  res.json({ message: 'Status updated.' });
});

app.delete('/api/users/:id', auth, requireRole('admin'), async (req, res) => {
  const id = toInt(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid user id.' });
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account.' });

  const [orders] = await db.query('SELECT COUNT(*) AS n FROM orders WHERE user_id = ?', [id]);
  if (orders[0].n > 0) return res.status(409).json({ error: 'Cannot delete user: this user has existing orders.' });

  const [result] = await db.query('DELETE FROM users WHERE id = ?', [id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'User not found.' });
  res.json({ message: 'User deleted.' });
});

function sendPharmalinkError(res, result) {
  const status = result.status === 404 ? 404 : 502;
  res.status(status).json({ error: result.error || 'PharmaLink is not available right now.' });
}

app.get('/api/pharmalink/medicines', async (req, res) => {
  const name = String(req.query.name || '');
  const result = await pl.call('GET', '/medicines?name=' + encodeURIComponent(name));
  if (!result.ok) return sendPharmalinkError(res, result);
  res.json(pl.unwrapList(result.data).map(pl.normalizeMedicine));
});

app.get('/api/pharmalink/inventory', async (req, res) => {
  const medicineId = String(req.query.medicineId || '');
  if (!medicineId) return res.status(400).json({ error: 'medicineId is required.' });
  const result = await pl.call('GET', '/inventory?medicineId=' + encodeURIComponent(medicineId) + '&sortBy=price');
  if (!result.ok) return sendPharmalinkError(res, result);
  const rows = pl.unwrapList(result.data).map(pl.normalizeInventory);
  rows.sort((a, b) => a.price - b.price);
  res.json(rows);
});

app.get('/api/pharmalink/inventory/:id', async (req, res) => {
  const result = await pl.call('GET', '/inventory/' + encodeURIComponent(req.params.id));
  if (!result.ok) return sendPharmalinkError(res, result);
  res.json(pl.normalizeInventory(pl.unwrapOne(result.data)));
});

app.get('/api/pharmalink/pharmacies', async (req, res) => {
  const result = await pl.call('GET', '/pharmacies');
  if (!result.ok) return sendPharmalinkError(res, result);
  res.json(pl.unwrapList(result.data).map(pl.normalizePharmacy));
});

app.get('/api/pharmalink/pharmacies/:id', async (req, res) => {
  const result = await pl.call('GET', '/pharmacies/' + encodeURIComponent(req.params.id));
  if (!result.ok) return sendPharmalinkError(res, result);
  res.json(pl.normalizePharmacy(pl.unwrapOne(result.data)));
});

app.post('/api/pharmalink/reservations', auth, async (req, res) => {
  const inventoryId = String((req.body && req.body.inventoryId) || '');
  const quantity = toInt(req.body && req.body.quantity);
  if (!inventoryId) return res.status(400).json({ error: 'inventoryId is required.' });
  if (Number.isNaN(quantity) || quantity < 1) return res.status(400).json({ error: 'Please choose a valid quantity.' });

  const check = await pl.call('GET', '/inventory/' + encodeURIComponent(inventoryId));
  if (!check.ok) return sendPharmalinkError(res, check);
  const record = pl.normalizeInventory(pl.unwrapOne(check.data));
  if (record.quantity < quantity) {
    return res.status(409).json({ error: 'Not enough stock. Only ' + record.quantity + ' available.' });
  }

  const created = await pl.call('POST', '/reservations', {
    medicineId: record.medicineId,
    pharmacyId: record.pharmacyId,
    inventoryId: record.id || inventoryId,
    quantity,
    patientId: req.user.id
  });
  if (!created.ok) return sendPharmalinkError(res, created);

  const data = pl.unwrapOne(created.data);
  const reservationId = data.id || data.reservationId || data.reservation_id || '';
  res.status(201).json({ id: reservationId, message: 'Reservation created. Please collect it in person at the pharmacy.' });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log('Strathmore Cafeteria API running on port ' + PORT);
});
