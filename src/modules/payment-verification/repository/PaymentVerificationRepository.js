const PaymentVerification = require('../../../../models/PaymentVerification');

class PaymentVerificationRepository {
  static async create(data) {
    return await PaymentVerification.create(data);
  }

  /**
   * Returns a query (not executed) so .session() can be chained
   */
  static findOne(query) {
    return PaymentVerification.findOne(query);
  }

  static async findById(id) {
    return await PaymentVerification.findById(id);
  }

  static async findOneAndUpdate(query, update, options = {}) {
    return await PaymentVerification.findOneAndUpdate(query, update, options);
  }

  static async find(query, options = {}) {
    let queryBuilder = PaymentVerification.find(query);
    
    if (options.sort) {
      queryBuilder = queryBuilder.sort(options.sort);
    }
    
    if (options.limit) {
      queryBuilder = queryBuilder.limit(options.limit);
    }
    
    if (options.skip) {
      queryBuilder = queryBuilder.skip(options.skip);
    }
    
    if (options.populate) {
      queryBuilder = queryBuilder.populate(options.populate);
    }
    
    return await queryBuilder.exec();
  }

  static async countDocuments(query) {
    return await PaymentVerification.countDocuments(query);
  }

  static async deleteMany(query = {}) {
    return await PaymentVerification.deleteMany(query);
  }
}

module.exports = PaymentVerificationRepository;
