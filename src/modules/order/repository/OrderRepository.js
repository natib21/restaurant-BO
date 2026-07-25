const Order = require('../../../../models/orderModel');
const OrderIdempotency = require('../../../../models/OrderIdempotency');
const Payment = require('../../../../models/paymentModel');
const OrderItem = require('../../../../models/orderModelItem');

/**
 * MongoDB access for order domain — thin wrappers only (no business rules).
 */
class OrderRepository {
  static find(filter) {
    return Order.find(filter);
  }

  static findOne(filter) {
    return Order.findOne(filter);
  }

  static findById(id) {
    return Order.findById(id);
  }

  static countDocuments(filter) {
    return Order.countDocuments(filter);
  }

  static aggregate(pipeline) {
    return Order.aggregate(pipeline);
  }

  static create(docs, options) {
    return Order.create(docs, options);
  }

  static newOrder(data) {
    return new Order(data);
  }

  static startSession() {
    return Order.startSession();
  }

  static getOrderModel() {
    return Order;
  }

  static findIdempotencyOne(filter) {
    return OrderIdempotency.findOne(filter);
  }

  static createIdempotency(doc) {
    return OrderIdempotency.create(doc);
  }

  static findOneAndUpdateIdempotency(filter, update, options) {
    return OrderIdempotency.findOneAndUpdate(filter, update, options);
  }

  static deleteIdempotencyOne(filter) {
    return OrderIdempotency.deleteOne(filter);
  }

  static findPaymentOne(filter) {
    return Payment.findOne(filter);
  }

  static createPayment(docs, options) {
    return Payment.create(docs, options);
  }

  static findOrderItemOne(filter) {
    return OrderItem.findOne(filter);
  }
}

module.exports = { OrderRepository };