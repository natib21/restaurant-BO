const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const roleSchema = new Schema({
  merchant: {
    type: Schema.Types.ObjectId,
    ref: "Merchant", // the restaurant this role belongs to (required for merchant context)
    required: function () {
      return this.context === "merchant"; // only required for merchant roles
    },
  },
   context: {
    type: String,
    enum: ["merchant", "backoffice"], // merchant = restaurant staff, backoffice = internal staff
    required: true,
  },
  name: {
    type: String,
    required: true, // e.g. "Kitchen", "Waiter", "Cashier"
    trim: true,
  },
  description:{
    type:String,
    require:true,
    trim:true
  },
  tasks: [
    {
      type: Schema.Types.ObjectId,
      ref: "Task",
    }
  ],
  createdAt: { type: Date, default: Date.now },
});

const Role = mongoose.model("Role", roleSchema);

module.exports = Role;

