const Order = require('../../../../models/orderModel');
const Customer = require('../../../../models/customerModule');
const Table = require('../../../../models/tabelModel');
const CustomerSession = require('../../../../models/customerSessionModule');
const { NotificationService } = require('../../notifications/notification.service');
const AppError = require('../../../../utils/appError');
const logger = require('../../../../utils/logger');

/**
 * Payment Completion Service
 * 
 * Extracted from OrderService.markAsPaid to be reusable by payment verification flow.
 * Handles marking order as paid, completing dine-in orders, table cleanup, and loyalty points.
 */
class PaymentCompletionService {
  /**
   * Complete payment for an order
   * 
   * @param {Object} params
   * @param {ObjectId} params.orderId
   * @param {ObjectId} params.merchantId
   * @param {string} params.paymentMethod - 'cash', 'card', 'mobile_banking', etc.
   * @param {string} [params.bankName] - Bank name for mobile_banking
   * @param {string} [params.receiptImage] - Receipt image URL
   * @param {ObjectId} [params.customerId] - Customer ID for loyalty points
   * @param {Session} session - Mongoose session for transaction
   */
  static async completePayment(params, session) {
    const {
      orderId,
      merchantId,
      paymentMethod,
      bankName = null,
      receiptImage = null,
      customerId = null,
    } = params;
    
    // Fetch order with session
    const order = await Order.findOne({
      _id: orderId,
      merchant: merchantId,
    }).session(session);
    
    if (!order) {
      throw new AppError('Order not found', 404);
    }
    
    if (order.paymentStatus === 'paid') {
      throw new AppError('Order already paid', 400);
    }
    
    if (order.status === 'canceled') {
      throw new AppError('Cannot mark a canceled order as paid', 400);
    }
    
    // ✅ GUARD: Dine-in orders must have all items served before payment completes them
    if (order.orderType === 'dine_in' && order.status !== 'served') {
      throw new AppError(
        'Cannot complete a dine-in order before all items have been served',
        400
      );
    }
    
    // Mark order as paid
    order.paymentStatus = 'paid';
    order.paidAt = new Date();
    
    order.paymentDetails = {
      method: paymentMethod,
      bankName: bankName,
      paidAt: new Date(),
      receiptImage: receiptImage,
    };
    
    await order.save({ session });
    
    // ✅ COMPLETION LOGIC: Only complete if not already completed
    // For dine-in: guard above ensures status === 'served', so this always succeeds
    // For takeaway/delivery: payment does NOT complete the order (stays in current status)
    if (order.status !== 'completed') {
      // Only dine-in orders reach here (takeaway/delivery require separate pickup/delivery completion)
      if (order.orderType === 'dine_in') {
        order.status = 'completed';
        order.completedAt = new Date();
        await order.save({ session });
        
        // ✅ TABLE CLEANUP: Only runs when order actually completes
        if (order.table) {
          await CustomerSession.updateOne(
            { 
              merchant: merchantId,
              tableId: order.table, 
              isActive: true 
            },
            { isActive: false },
            { session }
          );
          
          const table = await Table.findOne({
            _id: order.table,
            merchant: merchantId,
          }).session(session);
          
          if (table) {
            table.status = 'available';
            await table.save({ session });
          }
        }
      }
      // else: takeaway/delivery payment does NOT complete order - separate endpoint needed
    }
    
    // ✅ LOYALTY POINTS: Award points if customer is provided
    if (customerId) {
      const points = Math.floor(order.totalAmount);
      
      // Atomic increment — safe under withTransaction retries because
      // each retry issues a fresh $inc against the DB value rather than
      // reading a stale in-memory snapshot and adding to it again.
      await Customer.findByIdAndUpdate(
        customerId,
        {
          $inc: {
            'loyalty.points': points,
            'loyalty.totalPointsEarned': points,
          },
          $push: {
            history: {
              action: 'award_points',
              details: `Earned ${points} points from order ${order.orderNumber} (${paymentMethod})`,
              order: order._id,
              addedAt: new Date(),
            },
          },
        },
        { session, new: true }
      );
      
      // Re-fetch after $inc to get the authoritative totalPointsEarned
      // for tier threshold comparison — in-memory snapshot is no longer valid.
      const updatedCustomer = await Customer.findById(customerId)
        .select('loyalty.totalPointsEarned loyalty.tier')
        .session(session)
        .lean();
      
      if (updatedCustomer) {
        const tiers = {
          platinum: 50000,
          gold: 20000,
          silver: 5000,
          bronze: 0,
        };
        
        const newTier = Object.keys(tiers).find(
          tier => updatedCustomer.loyalty.totalPointsEarned >= tiers[tier]
        );
        
        if (newTier && newTier !== updatedCustomer.loyalty.tier) {
          await Customer.findByIdAndUpdate(
            customerId,
            { $set: { 'loyalty.tier': newTier } },
            { session }
          );
        }
      }
    }
    
    // Notify about payment
    await NotificationService.notifyOrderPaid(
      { order, paymentMethod, bankName, image: receiptImage },
      session
    );
    
    logger.info('payment.completed', {
      orderId: orderId.toString(),
      orderNumber: order.orderNumber,
      amount: order.totalAmount,
      method: paymentMethod,
    });
    
    return order;
  }
}

module.exports = PaymentCompletionService;
