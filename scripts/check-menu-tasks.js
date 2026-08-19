const mongoose = require('mongoose');
const { getMongoUri } = require('../src/config/env');
const Task = require('../models/taskModel');

async function checkMenuTasks() {
  await mongoose.connect(getMongoUri());
  const tasks = await Task.find({ endpoint: { $regex: /menu|combo/i } }).lean();
  console.log(`Found ${tasks.length} menu/combo-related tasks:`);
  tasks.forEach(t => {
    console.log(`  ${t.method} ${t.endpoint} (${t.name})`);
  });
  await mongoose.disconnect();
}

checkMenuTasks();
