class ApiFeatures {
  constructor(query, queryString) {
    this.query = query;
    this.queryString = queryString;
  }

  /**
   * Recursively walk a value and throw a 400 AppError if any object key
   * starts with '$' and is not one of the four whitelisted comparison
   * operators that filter() re-introduces after sanitisation.
   *
   * Allowed after the gte/gt/lte/lt rewrite: $gte $gt $lte $lt
   * Everything else ($ne, $where, $expr, $regex, …) is rejected.
   */
  static _assertNoMongoOperators(value, path) {
    const WHITELIST = new Set(['$gte', '$gt', '$lte', '$lt']);

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const key of Object.keys(value)) {
        if (key.startsWith('$')) {
          if (!WHITELIST.has(key)) {
            const AppError = require('./appError');
            throw new AppError(
              `Invalid query parameter: operator "${key}" is not allowed`,
              400
            );
          }
        }
        ApiFeatures._assertNoMongoOperators(value[key], `${path}.${key}`);
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, i) =>
        ApiFeatures._assertNoMongoOperators(item, `${path}[${i}]`)
      );
    }
  }

  filter() {
    const queryObj = { ...this.queryString };

    const excludedFields = ['page', 'sort', 'limit', 'fields', 'search'];
    excludedFields.forEach(el => delete queryObj[el]);

    // ── Reject any MongoDB operator key that is not in the gte/gt/lte/lt
    //    whitelist.  Express parses ?field[$ne]=x into { field: { $ne: 'x' } }
    //    so we must inspect the parsed object before it reaches Mongoose.
    for (const [topKey, topValue] of Object.entries(queryObj)) {
      if (topKey.startsWith('$')) {
        const AppError = require('./appError');
        throw new AppError(
          `Invalid query parameter: top-level operator key "${topKey}" is not allowed`,
          400
        );
      }
      ApiFeatures._assertNoMongoOperators(topValue, topKey);
    }

    let queryStr = JSON.stringify(queryObj);

    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);

    this.query = this.query.find(JSON.parse(queryStr));

    return this;
  }

  // New — regex search must NOT go through filter()'s JSON.stringify/parse,
  // since a RegExp object serializes to `{}` and silently loses the pattern.
  search(fields = []) {
    if (this.queryString.search && fields.length > 0) {
      const regex = new RegExp(this.queryString.search.trim(), 'i');
      
      // ✅ Handle localized fields (name, description) by searching both en and am
      const searchConditions = fields.flatMap(field => {
        if (field === 'name' || field === 'description') {
          // For localized fields, search both English and Amharic
          return [
            { [`${field}.en`]: regex },
            { [`${field}.am`]: regex }
          ];
        }
        // For non-localized fields, search as usual
        return [{ [field]: regex }];
      });
      
      this.query = this.query.find({ $or: searchConditions });
    }
    return this;
  }

  sort() {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(',').join(' ');
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort('-createdAt');
    }
    return this;
  }

  limitFields() {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(',').join(' ');
      this.query = this.query.select(fields);
    } else {
      this.query = this.query.select('-__v');
    }
    return this;
  }

  paginate() {
    const MAX_LIMIT = 100;
    const DEFAULT_LIMIT = 100;

    const page = this.queryString.page * 1 || 1;
    // Cap the limit: never exceed MAX_LIMIT regardless of what the client requests.
    const requested = this.queryString.limit * 1;
    const limit = requested > 0 ? Math.min(requested, MAX_LIMIT) : DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    this.query = this.query.skip(skip).limit(limit);

    return this;
  }
}

module.exports = ApiFeatures;
