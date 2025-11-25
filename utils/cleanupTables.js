// utils/cleanupTables.js
const Table = require('../models/tableModule');
const CustomerSession = require('../models/customerSessionModule');

setInterval(
  async () => {
    try {
      const expiredSessions = await CustomerSession.find({
        isActive: true,
        expiresAt: { $lt: new Date() },
      }).select('tableId');

      const tableIds = expiredSessions.map(s => s.tableId);
      if (tableIds.length > 0) {
        await Table.updateMany(
          { _id: { $in: tableIds }, status: 'occupied' },
          { status: 'available' }
        );
        await CustomerSession.updateMany(
          { _id: { $in: expiredSessions.map(s => s._id) } },
          { isActive: false }
        );
      }
    } catch (err) {
      console.error('Cleanup failed:', err);
    }
  },
  5 * 60 * 1000
); // every 5 minutes
