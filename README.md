# Strathmore Cafeteria Ordering System (Node.js + static front end)

```
server/     Node.js + Express API (runs on Render, or on your computer)
frontend/   Static HTML/CSS/JS pages (published with GitHub Pages)
```

The API uses the same MySQL tables as the PHP app (`users`, `menu`, `orders`).
Accounts made in the PHP app work here, and the other way round.

## 1. Run it on your computer first

1. Install Node.js (LTS) from nodejs.org.
2. Start MySQL in XAMPP and make sure the database `strathmore_ordering` exists (you already imported `database.sql`).
3. In a terminal:

```
cd server
npm install
copy .env.example .env
```

4. Open `server/.env` and set:
   - `JWT_SECRET` to any long random text
   - `DB_PASSWORD` to your MySQL password (empty if you have none)
5. Create the missing `delivered` status and check the tables:

```
npm run init-db
```

6. Start the API:

```
npm start
```

7. Open `http://localhost:3000/api/health`. It should say `"database":"connected"`.
8. Open `frontend/index.html` with the VS Code "Live Server" extension (right-click, Open with Live Server). The pages call `http://localhost:3000/api`.

`CORS_ORIGIN` in `.env` must include the address Live Server uses (usually `http://127.0.0.1:5500` or `http://localhost:5500`). Leave `CORS_ORIGIN` empty while testing locally to allow any address.

## 2. Put the database online

Use a free cloud MySQL (for example Aiven or TiDB Cloud; check their current free plans). Create a database, then note the host, port, user, password and database name.
Run `npm run init-db` once from your computer with those values in `server/.env` (and `DB_SSL=true` if the host requires SSL). It creates the tables and the 20 menu items.

## 3. Put the API online (Render)

1. Push this project to GitHub.
2. On render.com choose New, Web Service, and connect the repo.
3. Root Directory: `server`. Build Command: `npm install`. Start Command: `npm start`.
4. Under Environment add: `JWT_SECRET`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`, and `CORS_ORIGIN=https://dxrl3n3.github.io`.
5. Deploy. Open `https://YOUR-SERVICE.onrender.com/api/health` to check it.

Free Render services go to sleep when idle, so the first request after a break can take about a minute.

## 4. Publish the front end (GitHub Pages)

1. Open `frontend/js/config.js` and change the address to your Render URL:

```
window.API_BASE_URL = 'https://YOUR-SERVICE.onrender.com/api';
```

2. Copy the contents of `frontend/` (the `.html` files, `styles.css`, `css/` and `js/`) into the repo root, or into a `docs/` folder.
3. On GitHub open Settings, Pages, and choose Deploy from a branch, branch `main`, folder `/ (root)` (or `/docs`).
4. Visit `https://dxrl3n3.github.io/strath-food-app/`.

## PharmaLink

The Food App calls PharmaLink through its own API (`/api/pharmalink/...`), so the browser never talks to PharmaLink directly.

- `PHARMALINK_MOCK=true` uses built-in sample data (default).
- To use the real PharmaLink, set `PHARMALINK_MOCK=false` and `PHARMALINK_BASE_URL` to its API address.
- If PharmaLink uses different field names, adjust the `normalize...` functions in `server/pharmalink.js`.

## API endpoints

| Method | Path | Who |
| :--- | :--- | :--- |
| POST | /api/auth/register | anyone |
| POST | /api/auth/login | anyone |
| GET | /api/auth/me | logged in |
| GET | /api/menu | anyone |
| PUT | /api/menu | kitchen |
| POST | /api/orders | student |
| GET | /api/orders | student (own), kitchen (all) |
| PUT | /api/orders/:id/status | kitchen |
| GET | /api/users | admin |
| PUT | /api/users/:id/role | admin |
| PUT | /api/users/:id/status | admin |
| DELETE | /api/users/:id | admin |
| GET | /api/pharmalink/medicines?name= | anyone |
| GET | /api/pharmalink/inventory?medicineId= | anyone |
| GET | /api/pharmalink/inventory/:id | anyone |
| GET | /api/pharmalink/pharmacies | anyone |
| GET | /api/pharmalink/pharmacies/:id | anyone |
| POST | /api/pharmalink/reservations | logged in |

Send the token from login as `Authorization: Bearer <token>`.
