const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const roleSchema = new Schema({
  name: {
    type: String,
    required: true, 
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

