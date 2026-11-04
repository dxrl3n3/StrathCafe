const { createApp } = require('./server');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, details) {
  if (condition) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    failures.push(name);
    console.log('FAIL  ' + name + (details !== undefined ? '  ->  ' + JSON.stringify(details) : ''));
  }
}

function section(title) {
  console.log('\n=== ' + title + ' ===');
}

let base = '';

async function call(method, path, body, options) {
  options = options || {};
  const headers = {};
  let payload;
  if (options.raw !== undefined) {
    payload = options.raw;
    headers['Content-Type'] = options.contentType || 'application/json';
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(base + path, { method: method, headers: headers, body: payload });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  return { status: res.status, data: data, headers: res.headers };
}

const goodOrder = () => ({
  studentId: 'std-1001',
  items: [
    { itemId: 'food-1', itemType: 'food', quantity: 2 },
    { itemId: 'med-101', itemType: 'medicine', quantity: 1 }
  ]
});

async function countOrders(studentId) {
  const r = await call('GET', '/cafeteria/students/' + studentId + '/orders');
  return r.data.length;
}

async function run() {
  section('Week 5 GET endpoints still work');
  let r = await call('GET', '/cafeteria/menu');
  check('GET /cafeteria/menu returns 200 and a list', r.status === 200 && Array.isArray(r.data) && r.data.length > 0, r.status);
  check('menu includes med-101', r.data.some((m) => m.itemId === 'med-101'));
  check('menu hides unavailable item med-104', !r.data.some((m) => m.itemId === 'med-104'));
  r = await call('GET', '/cafeteria/orders/ord-5001');
  check('GET order ord-5001 returns 200', r.status === 200 && r.data.id === 'ord-5001', r.status);
  r = await call('GET', '/cafeteria/orders/ord-9999');
  check('GET unknown order returns 404', r.status === 404 && typeof r.data.message === 'string', r.status);
  r = await call('GET', '/cafeteria/students/std-8842/orders');
  check('GET student history returns 200 with ord-5001', r.status === 200 && r.data.some((o) => o.id === 'ord-5001'), r.status);
  r = await call('GET', '/cafeteria/students/std-nobody/orders');
  check('GET history for a student with no orders returns 200 and []', r.status === 200 && Array.isArray(r.data) && r.data.length === 0, r.status);

  section('POST /cafeteria/orders with valid input');
  const before = await countOrders('std-1001');
  r = await call('POST', '/cafeteria/orders', goodOrder());
  check('valid POST returns 201 (not 200)', r.status === 201, r.status);
  check('response has id like ord-####', /^ord-\d+$/.test(r.data.id), r.data);
  check('response status is pending', r.data.status === 'pending');
  check('response total is correct (2 x 350 + 1 x 50 = 750)', r.data.total === 750, r.data.total);
  check('response items keep itemId, itemType, quantity', r.data.items.length === 2 && r.data.items[0].itemId === 'food-1' && r.data.items[0].quantity === 2);
  check('Location header points at the new order', r.headers.get('location') === '/cafeteria/orders/' + r.data.id, r.headers.get('location'));
  const created = r.data;
  const createdNumber = Number(created.id.split('-')[1]);
  r = await call('GET', '/cafeteria/orders/' + created.id);
  check('re-fetching the new order with GET returns 200 and the same data', r.status === 200 && r.data.studentId === 'std-1001' && r.data.total === 750, r.status);
  check('order history for the student now has one more order', (await countOrders('std-1001')) === before + 1);

  section('POST /cafeteria/orders with bad input (each must be 400)');
  const badBodies = [
    ['empty object {}', {}],
    ['missing studentId', { items: goodOrder().items }],
    ['missing items', { studentId: 'std-1001' }],
    ['studentId is a number', { studentId: 1001, items: goodOrder().items }],
    ['studentId is an empty string', { studentId: '', items: goodOrder().items }],
    ['studentId is only spaces', { studentId: '   ', items: goodOrder().items }],
    ['studentId over 50 characters', { studentId: 'x'.repeat(51), items: goodOrder().items }],
    ['items is a string, not an array', { studentId: 'std-1001', items: 'med-101' }],
    ['items is an empty array', { studentId: 'std-1001', items: [] }],
    ['item is not an object', { studentId: 'std-1001', items: ['med-101'] }],
    ['item missing itemId', { studentId: 'std-1001', items: [{ itemType: 'food', quantity: 1 }] }],
    ['item missing itemType', { studentId: 'std-1001', items: [{ itemId: 'food-1', quantity: 1 }] }],
    ['item missing quantity', { studentId: 'std-1001', items: [{ itemId: 'food-1', itemType: 'food' }] }],
    ['itemId is a number', { studentId: 'std-1001', items: [{ itemId: 1, itemType: 'food', quantity: 1 }] }],
    ['itemId is an empty string', { studentId: 'std-1001', items: [{ itemId: '', itemType: 'food', quantity: 1 }] }],
    ['itemType not in enum (drink)', { studentId: 'std-1001', items: [{ itemId: 'food-1', itemType: 'drink', quantity: 1 }] }],
    ['itemType is a number', { studentId: 'std-1001', items: [{ itemId: 'food-1', itemType: 5, quantity: 1 }] }],
    ['quantity is a string "2"', { studentId: 'std-1001', items: [{ itemId: 'food-1', itemType: 'food', quantity: '2' }] }],
    ['quantity is 1.5', { studentId: 'std-1001', items: [{ itemId: 'food-1', itemType: 'food', quantity: 1.5 }] }],
    ['quantity is 0', { studentId: 'std-1001', items: [{ itemId: 'food-1', itemType: 'food', quantity: 0 }] }],
    ['quantity is negative', { studentId: 'std-1001', items: [{ itemId: 'food-1', itemType: 'food', quantity: -3 }] }],
    ['quantity is 101 (over the limit)', { studentId: 'std-1001', items: [{ itemId: 'food-1', itemType: 'food', quantity: 101 }] }],
    ['quantity is null', { studentId: 'std-1001', items: [{ itemId: 'food-1', itemType: 'food', quantity: null }] }],
    ['itemId not on the menu', { studentId: 'std-1001', items: [{ itemId: 'food-999', itemType: 'food', quantity: 1 }] }],
    ['itemType does not match the item (med-101 as food)', { studentId: 'std-1001', items: [{ itemId: 'med-101', itemType: 'food', quantity: 1 }] }],
    ['item exists but is unavailable (med-104)', { studentId: 'std-1001', items: [{ itemId: 'med-104', itemType: 'medicine', quantity: 1 }] }]
  ];
  for (const [name, body] of badBodies) {
    r = await call('POST', '/cafeteria/orders', body);
    check('400 for ' + name, r.status === 400 && typeof r.data.message === 'string' && r.data.message.length > 0, [r.status, r.data]);
  }
  r = await call('POST', '/cafeteria/orders');
  check('400 for no request body at all', r.status === 400, r.status);
  r = await call('POST', '/cafeteria/orders', undefined, { raw: '{ this is not json', contentType: 'application/json' });
  check('400 for malformed JSON', r.status === 400 && typeof r.data.message === 'string', [r.status, r.data]);
  r = await call('POST', '/cafeteria/orders', undefined, { raw: 'hello', contentType: 'text/plain' });
  check('400 for a non-JSON body (text/plain)', r.status === 400, r.status);
  r = await call('POST', '/cafeteria/orders', undefined, { raw: '[1,2,3]' });
  check('400 when the body is a JSON array', r.status === 400, r.status);

  section('Rejected requests leave nothing behind');
  const beforeBad = await countOrders('std-2002');
  r = await call('POST', '/cafeteria/orders', {
    studentId: 'std-2002',
    items: [
      { itemId: 'food-1', itemType: 'food', quantity: 1 },
      { itemId: 'food-2', itemType: 'food', quantity: 0 }
    ]
  });
  check('order with one good and one bad item is rejected with 400', r.status === 400, r.status);
  check('no order was stored for the student', (await countOrders('std-2002')) === beforeBad);
  r = await call('POST', '/cafeteria/orders', { studentId: 'std-2002', items: [{ itemId: 'med-102', itemType: 'medicine', quantity: 1 }] });
  check('next valid order still gets the next sequential id (no ids wasted)', r.status === 201 && Number(r.data.id.split('-')[1]) === createdNumber + 1, r.data);

  section('PATCH /cafeteria/orders/{id} with valid input');
  r = await call('PATCH', '/cafeteria/orders/' + created.id, { status: 'fulfilled' });
  check('PATCH to fulfilled returns 200', r.status === 200 && r.data.status === 'fulfilled', [r.status, r.data]);
  r = await call('GET', '/cafeteria/orders/' + created.id);
  check('GET confirms the status really changed', r.status === 200 && r.data.status === 'fulfilled', r.data);
  const firstState = JSON.stringify(r.data);
  r = await call('PATCH', '/cafeteria/orders/' + created.id, { status: 'fulfilled' });
  check('same PATCH sent twice returns 200 again', r.status === 200, r.status);
  r = await call('GET', '/cafeteria/orders/' + created.id);
  check('same PATCH twice gives the identical end state (idempotent)', JSON.stringify(r.data) === firstState, r.data);
  r = await call('PATCH', '/cafeteria/orders/' + created.id, { status: 'cancelled' });
  check('PATCH to cancelled returns 200', r.status === 200 && r.data.status === 'cancelled', [r.status, r.data]);
  r = await call('PATCH', '/cafeteria/orders/ord-5001', { status: 'pending' });
  check('PATCH to pending returns 200', r.status === 200 && r.data.status === 'pending', [r.status, r.data]);
  r = await call('PATCH', '/cafeteria/orders/' + created.id, { status: 'fulfilled', studentId: 'std-hacker', total: 1 });
  check('extra fields in the body are ignored (studentId and total unchanged)', r.status === 200 && r.data.studentId === 'std-1001' && r.data.total === 750, r.data);

  section('PATCH with bad input');
  const target = created.id;
  const stateBefore = JSON.stringify((await call('GET', '/cafeteria/orders/' + target)).data);
  const badPatches = [
    ['empty object {}', {}],
    ['status missing (other field only)', { note: 'hello' }],
    ['status is a number', { status: 123 }],
    ['status is null', { status: null }],
    ['status is not in the enum (shipped)', { status: 'shipped' }],
    ['status has the wrong case (Fulfilled)', { status: 'Fulfilled' }],
    ['status is an empty string', { status: '' }]
  ];
  for (const [name, body] of badPatches) {
    r = await call('PATCH', '/cafeteria/orders/' + target, body);
    check('400 for ' + name, r.status === 400 && typeof r.data.message === 'string', [r.status, r.data]);
  }
  r = await call('PATCH', '/cafeteria/orders/' + target);
  check('400 for no request body at all', r.status === 400, r.status);
  r = await call('PATCH', '/cafeteria/orders/' + target, undefined, { raw: '{broken' });
  check('400 for malformed JSON', r.status === 400, r.status);
  const stateAfter = JSON.stringify((await call('GET', '/cafeteria/orders/' + target)).data);
  check('none of the rejected PATCH requests changed the order', stateAfter === stateBefore);

  section('PATCH on an order that does not exist');
  r = await call('PATCH', '/cafeteria/orders/ord-9999', { status: 'fulfilled' });
  check('404 for a valid body on a missing order', r.status === 404 && typeof r.data.message === 'string', [r.status, r.data]);
  r = await call('GET', '/cafeteria/orders/ord-9999');
  check('the missing order was not created by the PATCH', r.status === 404, r.status);
  r = await call('PATCH', '/cafeteria/orders/ord-9999', { status: 'shipped' });
  check('400 (validation first) for an invalid body on a missing order', r.status === 400, r.status);

  section('Other');
  r = await call('GET', '/cafeteria/nothing-here');
  check('unknown route returns 404 JSON', r.status === 404 && typeof r.data.message === 'string', r.status);
}

(async () => {
  const app = createApp(null);
  const server = app.listen(0);
  base = 'http://127.0.0.1:' + server.address().port;
  try {
    await run();
  } catch (err) {
    failed += 1;
    failures.push('test run crashed: ' + err.message);
    console.log('\nThe test run crashed: ' + err.message);
  }
  server.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed) {
    console.log('Failed checks:');
    failures.forEach((f) => console.log(' - ' + f));
  }
  process.exit(failed ? 1 : 0);
})();
