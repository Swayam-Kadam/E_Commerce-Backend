const Razorpay = require('razorpay');
const ErrorResponse = require('./errorResponse');

function getRazorpayInstance() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new ErrorResponse('Razorpay API keys are not configured', 500);
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

/**
 * Refund a Razorpay payment for an order.
 * Idempotent: if order already has refundId / paymentStatus refunded, returns existing id.
 *
 * @param {object} order - mongoose order doc (or lean object)
 * @returns {Promise<{ refundId: string|null, alreadyRefunded: boolean }>}
 */
async function refundOrderPayment(order) {
  if (order.paymentStatus === 'refunded' || order.refundId) {
    return {
      refundId: order.refundId || null,
      alreadyRefunded: true,
    };
  }

  // COD / unpaid — nothing to refund via Razorpay
  if (
    !order.razorpayPaymentId ||
    order.paymentMethod !== 'razorpay' ||
    order.paymentStatus !== 'completed'
  ) {
    return { refundId: null, alreadyRefunded: false };
  }

  const amountPaise = Math.round(Number(order.totalAmount) * 100);
  if (!Number.isFinite(amountPaise) || amountPaise < 1) {
    throw new ErrorResponse('Invalid refund amount', 400);
  }

  try {
    const razorpay = getRazorpayInstance();
    const refund = await razorpay.payments.refund(order.razorpayPaymentId, {
      amount: amountPaise,
      speed: 'normal',
      notes: {
        orderNumber: order.orderNumber || String(order._id),
        reason: 'customer_cancel_or_return',
      },
    });

    return {
      refundId: refund?.id || null,
      alreadyRefunded: false,
    };
  } catch (err) {
    const message =
      err?.error?.description ||
      err?.message ||
      'Refund failed. Please try again later.';
    throw new ErrorResponse(message, 502);
  }
}

module.exports = { refundOrderPayment, getRazorpayInstance };
