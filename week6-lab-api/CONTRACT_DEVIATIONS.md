# Contract Deviations

Week 6 changes. Each row says what the original contract said, what the implementation does, and why. `openapi.yaml` (version 1.1.0) was updated to match every row marked "Yes".

| # | Endpoint | Original contract | Implementation / updated contract | Why | Contract updated |
| :-- | :--- | :--- | :--- | :--- | :--- |
| 1 | POST /cafeteria/orders | No 400 response listed | Returns 400 with `{ "message": "..." }` for any validation failure | Writes must reject bad input before anything is stored | Yes |
| 2 | POST /cafeteria/orders | `quantity` was only "integer" | `quantity` must be an integer from 1 to 100 | 0, negative and huge values are technically integers but not usable | Yes |
| 3 | POST /cafeteria/orders | `items` was only "array" | `items` needs at least one entry (`minItems: 1`) | An order with no items is meaningless | Yes |
| 4 | POST /cafeteria/orders | `studentId`, `itemId` were only "string" | Both must be non-empty (`minLength: 1`); `studentId` at most 50 characters | An empty string is present but not valid | Yes |
| 5 | POST /cafeteria/orders | Nothing said about whether items exist | `itemId` must be on the menu, match its `itemType`, and be available, otherwise 400 | Stops orders for items that cannot be supplied | Yes |
| 6 | POST /cafeteria/orders | 201 had no response body defined | 201 returns the created Order and a `Location` header | Lets the client use the new order without another request | Yes |
| 7 | PATCH /cafeteria/orders/{id} | `status` was optional (no `required` list) | `status` is required | A PATCH with no status changes nothing | Yes |
| 8 | PATCH /cafeteria/orders/{id} | No 400 response listed | Returns 400 if `status` is missing, not a string, or not pending/fulfilled/cancelled | Same validation-first rule as POST | Yes |
| 9 | PATCH /cafeteria/orders/{id} | Response body not defined | 200 returns the updated Order | Lets the client confirm the change | Yes |
| 10 | PATCH /cafeteria/orders/{id} | Not stated | Validation runs before the existence check, so an invalid body for a missing order gets 400, not 404 | Bad input is rejected first, as the handout asks | Yes |
| 11 | GET /cafeteria/menu, GET orders | 200 had no response body defined | Menu items are `{ itemId, itemType, name, price }`; orders are the Order shape | Shapes were undefined, so they are now written down | Yes |
