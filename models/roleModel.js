const roleSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Merchant", // or "Restaurant"
    required: true,
  },
  name: {
    type: String,
    required: true, // e.g. "Kitchen", "Waiter", "Cashier"
    trim: true,
    unique:true
  },
  tasks: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
    }
  ],
  createdAt: { type: Date, default: Date.now },
});

const Role = mongoose.model("Role", roleSchema);
