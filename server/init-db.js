require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const MENU_SEED = [
  ['House Coffee', 250], ['Café Latte', 300], ['Café Mocha', 320], ['Cappuccino', 300],
  ['Masala Tea', 250], ['Iced Coffee', 320], ['Fresh Passion Juice', 350], ['Java Milkshake', 450],
  ['Smoothie (Mango)', 400], ['Bottled Water', 100], ['Pilau ya Nyama', 600], ['Biryani ya Kuku', 750],
  ['Samaki wa Kupaka', 850], ['Ugali na Sukuma Wiki', 300], ['Maharagwe ya Nazi', 350],
  ['Chicken Samosa (2pcs)', 300], ['Veggie Wrap', 600], ['Cheese Toastie', 400],
  ['Chips Masala', 350], ['Viazi Karai', 250]
];

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'strathmore_ordering',
    multipleStatements: true,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
  });

  await conn.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  await conn.query("ALTER TABLE orders MODIFY status ENUM('pending','paid','delivered') NOT NULL DEFAULT 'pending'");

  const [rows] = await conn.query('SELECT COUNT(*) AS n FROM menu');
  if (rows[0].n === 0) {
    await conn.query('INSERT INTO menu (name, price, available) VALUES ?', [MENU_SEED.map(([n, p]) => [n, p, 1])]);
    console.log('Menu seeded with ' + MENU_SEED.length + ' items.');
  } else {
    console.log('Menu already has items, not seeding.');
  }

  console.log('Database is ready.');
  await conn.end();
}

main().catch((err) => {
  console.error('init-db failed:', err.message);
  process.exit(1);
});
