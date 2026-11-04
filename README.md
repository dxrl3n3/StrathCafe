# Week 6: Write endpoints with validation

Implements every non-GET endpoint in `openapi.yaml` (`POST /cafeteria/orders`, `PATCH /cafeteria/orders/{id}`), plus the four GET endpoints from Week 5.

## Run it

```
npm install
npm start
```

- API: http://localhost:3001
- Swagger UI (try the endpoints): http://localhost:3001/docs
- Data is saved to `data.json` (created on first write, ignored by git). Delete it to reset to the seed data.

## Run the bad-input tests

```
npm test
```

To keep the output as evidence: `npm test > test-results.txt`

The tests start their own copy of the server in memory, so they never change `data.json`.

## What each write endpoint does

| Request | Result |
| :--- | :--- |
| POST valid order | 201 Created, returns the new order, `Location` header |
| POST with a missing field, wrong type, empty value, unknown or unavailable item, or bad JSON | 400 with `{ "message": "..." }`, nothing stored |
| PATCH valid status | 200 OK, returns the updated order |
| PATCH invalid or missing status, or bad JSON | 400, nothing changed |
| PATCH an order that does not exist | 404 |

Validation always runs before anything is written, and the PATCH body is checked before the order lookup.

## Seed data

- Order `ord-5001` for student `std-8842`
- Menu: `food-1`, `food-2`, `food-3`, `med-101`, `med-102`, `med-103` (available) and `med-104` (unavailable, used to test rejection)

## Submit

```
git add . CONTRACT_DEVIATIONS.md
git commit -m "Week 6: write endpoints implemented with validation"
git push
```
