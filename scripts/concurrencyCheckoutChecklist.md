# Concurrent checkout & stock — verification checklist

Use this after deploying payment/stock safety changes.
Requires MongoDB replica set / Atlas (transactions).

## Prerequisites

- Backend running with Razorpay keys configured
- One product with `stock: 1` (or set via Mongo / admin)
- Two authenticated user accounts (or two browser sessions)
- Both users have that product in cart with quantity 1

## Cases

### 1. Last-unit race (two buyers)

1. Set product stock to `1`.
2. User A and User B both open checkout and complete Razorpay (or call `verify-payment` nearly simultaneously in a script).
3. **Expect:** exactly one order with `orderStatus: processing` and `paymentStatus: completed`.
4. **Expect:** the other request returns `409` with `code: OUT_OF_STOCK_AFTER_PAY`.
5. **Expect:** product `stock` is `0` (never negative).
6. **Expect:** a cancelled recovery order exists for the failed user with `cancelReason: OUT_OF_STOCK`.

### 2. Idempotent verify retry

1. Complete a successful payment for User A.
2. Call `POST /api/v1/payment/api/verify-payment` again with the **same** `razorpay_payment_id` / `razorpay_order_id` / signature.
3. **Expect:** `200` with the same order document (no second order).
4. **Expect:** stock decremented only once; coupon `usedCount` incremented only once.

### 3. Amount mismatch (cart changed after Razorpay create)

1. User creates Razorpay order via `create-order`.
2. Before paying, change cart (add item or change quantity) so total differs.
3. Complete payment / verify with original Razorpay ids.
4. **Expect:** `409` amount mismatch error; no processing order; stock unchanged.

### 4. Cart cleared only on success

1. On successful verify: cart `items` empty, totals zero.
2. On `OUT_OF_STOCK_AFTER_PAY`: cart remains intact (transaction aborted before clear).

### 5. create-order UX pre-check (non-authoritative)

1. With stock `0`, call `create-order`.
2. **Expect:** early `400` stock error (Razorpay not opened).
3. Reminder: real safety is still `verifyPayment` atomic decrement.

## Quick Mongo checks

```js
// stock never negative
db.products.find({ stock: { $lt: 0 } })

// one processing order per payment id
db.orders.aggregate([
  { $match: { razorpayPaymentId: { $ne: null } } },
  { $group: { _id: '$razorpayPaymentId', n: { $sum: 1 } } },
  { $match: { n: { $gt: 1 } } }
])
```

## Optional parallel script idea

Use two concurrent `axios.post(verify-payment)` calls with valid signatures for the same last unit (harder with real Razorpay; easier with a staging mock). Primary validation remains the two-browser race above.
