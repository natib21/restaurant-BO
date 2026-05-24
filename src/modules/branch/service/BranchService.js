const crypto = require('crypto');
const ApiFeatures = require('../../../../utils/apiFeatures');
const AppError = require('../../../../utils/appError');
const logger = require('../../../../utils/logger');
const { generateSecureQR } = require('../../../../utils/secureQR');
const Role = require('../../../../models/roleModel');
const { BranchRepository } = require('../repository/BranchRepository');
const { BranchControlService } = require('../branch-control.service');
const { QrTokenService } = require('../qr-token.service');

const TABLE_TRANSITIONS = {
  available: ['occupied', 'reserved', 'disabled'],
  occupied: ['available', 'needs-cleaning'],
  reserved: ['occupied', 'available'],
  'needs-cleaning': ['available'],
  disabled: ['available'],
};

const REQUIRED_TASKS_FOR_TABLE_ASSIGNMENT = [
  'Accept Order',
  'View Order',
  'Serve Table',
  'Call Bill',
];

class BranchService {
  /* ---------- Branch control (BranchControlService — unchanged logic) ---------- */

  static suspendBranch(merchantId, branchId) {
    return BranchControlService.suspendBranch(merchantId, branchId);
  }

  static activateBranch(merchantId, branchId) {
    return BranchControlService.activateBranch(merchantId, branchId);
  }

  static setFeatureFlags(merchantId, branchId, features) {
    return BranchControlService.setFeatureFlags(merchantId, branchId, features);
  }

  static getFeatureFlags(branch) {
    return BranchControlService.getFeatureFlags(branch);
  }

  static assignMenuGroupToBranch(merchantId, menuGroupId, branchId) {
    return BranchControlService.assignMenuGroupToBranch(merchantId, menuGroupId, branchId);
  }

  static listStaffForBranch(merchantId, branchId) {
    return BranchControlService.listStaffForBranch(merchantId, branchId);
  }

  static assertBranchAccess(user, branchId) {
    return BranchControlService.assertBranchAccess(user, branchId);
  }

  static assertBranchActive(branch) {
    return BranchControlService.assertBranchActive(branch);
  }

  /* ---------- QR (canonical HMAC format — unchanged) ---------- */

  static buildQrPayload(params) {
    return QrTokenService.buildPayload(params);
  }

  static verifyQrScan(query) {
    return QrTokenService.verify({
      data: query.data,
      signature: query.s,
    });
  }

  static async generateSignedTableQr(tableId, merchantId) {
    const table = await BranchRepository.findTableById(tableId).select('+qrSecret');
    if (!table || table.merchant.toString() !== String(merchantId)) {
      throw new AppError('Table not found', 404);
    }

    const token = await QrTokenService.sign({
      merchantId: table.merchant,
      branchId: table.branch,
      tableId: table._id,
    });

    table.qrUrl = token.url;
    table.qrGeneratedAt = new Date();
    await table.save({ validateBeforeSave: false });

    return { table, ...token };
  }

  /**
   * Customer QR scan → table session (same behavior as customerSessionController.startTableSession).
   */
  static async startTableSessionFromQr({ data, s: signature }) {
    if (!data || !signature) {
      throw new AppError('Invalid QR code', 400);
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
      console.log('DECODED PAYLOAD:', payload);
    } catch {
      throw new AppError('Corrupted QR code', 400);
    }

    const { m: merchantId, b: branchId, t: tableId } = payload;

    console.log('Merchant Id : ', merchantId + ' table Id ', tableId, 'Branch Id : ' + branchId);
    if (!merchantId || !tableId || !branchId) throw new AppError('QR missing data', 400);

    const branch = await BranchRepository.findBranchById(branchId).select('+qrSecretKey');

    if (!branch || !branch.qrSecretKey) {
      throw new AppError('Branch QR secret key missing. Contact support.', 404);
    }

    const payloadString = JSON.stringify({
      m: merchantId.toString(),
      b: branchId.toString(),
      t: tableId.toString(),
    });

    console.log('branch Secret Me :', branch.qrSecretKey);

    const expectedSignature = crypto
      .createHmac('sha256', branch.qrSecretKey)
      .update(payloadString)
      .digest('hex');

    console.log('Signature :' + signature, 'ExpectedSign : ' + expectedSignature);
    if (expectedSignature !== signature) {
      throw new AppError('Fake QR code', 403);
    }

    const table = await BranchRepository.findTableOne({
      _id: tableId,
      branch: branchId,
      merchant: merchantId,
    });
    if (!table) throw new AppError('Table not found', 404);

    const active = await BranchRepository.findCustomerSessionOne({
      table: table._id,
      branch: branchId,
      isActive: true,
      expiresAt: { $gt: new Date() },
    });
    if (table.status !== 'available') {
      throw new AppError('Table is in use. Please wait or ask staff.', 409);
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    await BranchRepository.createCustomerSession({
      customer: null,
      merchant: merchantId,
      table: table._id,
      branch: branchId,
      token: sessionToken,
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
      isActive: true,
    });

    table.status = 'occupied';
    await table.save({ validateBeforeSave: false });

    return {
      sessionToken,
      table: table._id,
      tableNumber: table.tableNumber,
      branchId: branch._id,
      merchantId,
      message: 'Welcome!',
    };
  }

  static async freeTable({ tableId, merchantId, branchId }) {
    const table = await BranchRepository.findTableOne({
      _id: tableId,
      branch: branchId,
      merchant: merchantId,
    });
    if (!table) throw new AppError('Table not found', 404);

    await BranchRepository.updateCustomerSessionOne(
      { table: table._id, branch: branchId, isActive: true },
      { isActive: false, expiresAt: new Date() }
    );

    table.status = 'available';
    await table.save();

    return { tableNumber: table.tableNumber };
  }

  /* ---------- Table status transitions ---------- */

  static validateTableTransition(from, to) {
    if (from === to) return { noop: true };
    const allowed = TABLE_TRANSITIONS[from];
    if (!allowed || !allowed.includes(to)) {
      throw new AppError(`Invalid table status transition ${from} → ${to}`, 400);
    }
    return { noop: false };
  }

  static async validateTableForSession({ tableId, branchId, merchantId }) {
    const table = await BranchRepository.findTableOne({
      _id: tableId,
      branch: branchId,
      merchant: merchantId,
      isActive: true,
    });

    if (!table) throw new AppError('Table not found', 404);
    if (table.status === 'disabled') {
      throw new AppError('Table is disabled', 403);
    }

    return table;
  }

  static getActiveSession(tableId) {
    return BranchRepository.findCustomerSessionOne({
      table: tableId,
      isActive: true,
      expiresAt: { $gt: new Date() },
    });
  }

  static async transitionTableStatus({ tableId, merchantId, branchId, toStatus }) {
    const table = await BranchRepository.findTableOne({
      _id: tableId,
      merchant: merchantId,
      branch: branchId,
    });
    if (!table) throw new AppError('Table not found', 404);

    BranchService.validateTableTransition(table.status, toStatus);
    const previous = table.status;
    table.status = toStatus;
    await table.save({ validateBeforeSave: false });

    logger.info('table.status.transition', {
      tableId: String(tableId),
      from: previous,
      to: toStatus,
    });

    return { table, previous };
  }

  /* ---------- Branch CRUD ---------- */

  static async createBranch(req) {
    const merchantId = req.user.merchant._id;
    const { name, phone, city, subCity, specificArea, building, location, isMain } = req.body;

    if (!name || !city || !location || !location.coordinates) {
      throw new AppError('Name, city, and coordinates are required', 400);
    }

    if (isMain) {
      const existingMain = await BranchRepository.findBranchOne({
        merchant: merchantId,
        isMain: true,
      });
      if (existingMain) {
        throw new AppError('Only one main branch allowed', 400);
      }
    }

    return BranchRepository.createBranch({
      name,
      merchant: merchantId,
      phone,
      location: {
        type: 'Point',
        coordinates: location.coordinates,
        city,
        subCity,
        specificArea,
        building,
        formattedAddress: `${specificArea || ''}, ${subCity || ''}, ${city}`
          .replace(/^,\s*/, '')
          .trim(),
      },
      isMain: isMain || false,
      isActive: req.body.isActive ?? true,
      settings: req.body.settings || {},
      branding: req.body.branding || {},
    });
  }

  static async getAllBranches(req) {
    const merchantId = req.user.merchant._id;

    const features = new ApiFeatures(
      BranchRepository.findBranches({ merchant: merchantId }),
      req.query
    )
      .filter()
      .sort()
      .limitFields()
      .paginate();

    return features.query.select('-qrSecretKey').populate('merchant', 'businessName slug');
  }

  static async getBranch(id) {
    const query = id?.length === 6 ? { shortCode: id.toUpperCase() } : { _id: id };

    const branch = await BranchRepository.findBranchOne(query)
      .select('-qrSecretKey')
      .populate('merchant', 'businessName slug brandColor');

    if (!branch) throw new AppError('Branch not found', 404);
    return branch;
  }

  static async updateBranch(req) {
    const merchantId = req.user.merchant._id;

    if (req.body.isMain) {
      await BranchRepository.updateManyBranches(
        { merchant: merchantId, _id: { $ne: req.params.id } },
        { isMain: false }
      );
    }

    const branch = await BranchRepository.findOneAndUpdateBranch(
      { _id: req.params.id, merchant: merchantId },
      {
        name: req.body.name,
        phone: req.body.phone,
        'location.coordinates': req.body.coordinates,
        'location.city': req.body.city,
        'location.subCity': req.body.subCity,
        'location.specificArea': req.body.specificArea,
        'location.building': req.body.building,
        'location.formattedAddress': req.body.formattedAddress,
        isMain: req.body.isMain,
        isActive: req.body.isActive,
        settings: req.body.settings,
        branding: req.body.branding,
      },
      { new: true, runValidators: true }
    ).select('-qrSecretKey');

    if (!branch) throw new AppError('Branch not found or unauthorized', 404);
    return branch;
  }

  static async deleteBranch(req) {
    const merchantId = req.user.merchant._id;

    const branch = await BranchRepository.findOneAndUpdateBranch(
      { _id: req.params.id, merchant: merchantId },
      { isActive: false },
      { new: true }
    );

    if (!branch) throw new AppError('Branch not found or unauthorized', 404);
    return branch;
  }

  static async regenerateBranchQrCodes(req) {
    const merchantId = req.user.merchant._id;
    const branchId = req.params.id;

    const branch = await BranchRepository.findBranchOne({ _id: branchId, merchant: merchantId });
    if (!branch) throw new AppError('Branch not found', 404);

    branch.qrVersion += 1;
    branch.qrSecretKey = crypto.randomBytes(64).toString('hex');
    await branch.save();

    return { qrVersion: branch.qrVersion };
  }

  static async getNearbyBranches(req) {
    const { lat, lng, maxDistance = 5000 } = req.query;

    if (!lat || !lng) {
      throw new AppError('lat and lng query params required', 400);
    }

    return BranchRepository.aggregateBranches([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
          distanceField: 'distance',
          maxDistance: parseInt(maxDistance),
          spherical: true,
        },
      },
      { $match: { isActive: true } },
      {
        $lookup: {
          from: 'merchants',
          localField: 'merchant',
          foreignField: '_id',
          as: 'merchant',
        },
      },
      { $unwind: '$merchant' },
      {
        $project: {
          name: 1,
          shortCode: 1,
          publicUrl: 1,
          phone: 1,
          'location.formattedAddress': 1,
          distance: 1,
          'merchant.businessName': 1,
          'merchant.slug': 1,
          'merchant.brandColor': 1,
        },
      },
    ]);
  }

  static async inviteBranchManager(req) {
    const { email, phone, branchId, firstName } = req.body;

    const invitation = await Invitation.create({
      email,
      phone,
      branch: branchId,
      invitedBy: req.user._id,
      role: 'BRANCH-MANAGER',
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    await sendInvitationSMS(phone, invitation.token);

    return { message: 'Invitation sent successfully' };
  }

  static async getMerchantUsersByBranch(req) {
    const merchantId = req.user.merchant?._id;
    if (!merchantId) {
      throw new AppError(
        'Merchant context not found — are you logged in as a merchant user?',
        403
      );
    }

    const { id } = req.params;

    const branch = await BranchRepository.findBranchOne({
      _id: id,
      merchant: merchantId,
    })
      .select('name address isActive')
      .lean();

    if (!branch) {
      throw new AppError('Branch not found or does not belong to your merchant', 404);
    }

    if (!branch.isActive) {
      throw new AppError('This branch is currently inactive', 400);
    }

    const users = await BranchRepository.findUsers({
      merchant: merchantId,
      branch: id,
      isActive: true,
    })
      .select('firstName lastName phone email role isActive createdAt')
      .populate({ path: 'role', select: 'name description' })
      .sort({ firstName: 1, lastName: 1 })
      .lean();

    return {
      branch: { _id: id, name: branch.name || 'Unnamed Branch' },
      users,
    };
  }

  /* ---------- Tables ---------- */

  static async createTable(req) {
    const { tableNumber, capacity, location, section, status, branchId } = req.body;
    const merchantId = req.user.merchant._id;

    const isSuperAdmin = req.user.role?.name === 'SUPER-MERCHANT-ADMIN';
    const targetBranchId = isSuperAdmin ? branchId : req.user.branch._id;

    if (!targetBranchId) {
      throw new AppError('No branch associated with this request', 400);
    }

    if (!tableNumber || !capacity) {
      throw new AppError('Table number and capacity are required', 400);
    }

    const trimmedTableNumber = tableNumber.trim().toUpperCase();

    const existingTable = await BranchRepository.findTableOne({
      tableNumber: trimmedTableNumber,
      branch: targetBranchId,
      isActive: true,
    });

    if (existingTable) {
      throw new AppError(
        `Table "${trimmedTableNumber}" already exists in the selected branch`,
        400
      );
    }

    let table;
    try {
      table = await BranchRepository.createTable({
        tableNumber: trimmedTableNumber,
        capacity: Number(capacity),
        location: location || 'indoor',
        section: section?.trim() || null,
        status: status || 'available',
        branch: targetBranchId,
        merchant: merchantId,
      });

      const finalQR = await generateSecureQR(merchantId, targetBranchId, table._id);

      table.qrCode = finalQR.qrImage;
      table.qrData = finalQR.data;
      table.qrSignature = finalQR.signature;
      table.qrUrl = finalQR.url;
      table.qrGeneratedAt = new Date();

      await table.save({ validateBeforeSave: false });

      return table;
    } catch (err) {
      if (table && table._id) {
        await BranchRepository.deleteTableOne({ _id: table._id }).catch(console.error);
      }
      throw new AppError('Failed to create table: ' + err.message, 500);
    }
  }

  static async getAllTables(req) {
    const features = new ApiFeatures(
      BranchRepository.findTables({ merchant: req.user.merchant._id, isActive: true }),
      req.query
    )
      .filter()
      .sort()
      .limitFields()
      .paginate();

    return features.query.populate({
      path: 'branch',
      select: 'name branchCode isActive',
    });
  }

  static async getTable(req) {
    const table = await BranchRepository.findTableOne({
      _id: req.params.id,
      merchant: req.user.merchant._id,
    }).populate({
      path: 'branch',
      select: 'name branchCode isActive',
    });

    if (!table) throw new AppError('Table not found', 404);
    return table;
  }

  static async updateTable(req) {
    const allowedFields = ['tableNumber', 'capacity', 'status', 'location', 'section'];
    const updates = {};

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] =
          field === 'tableNumber' ? req.body[field]?.trim().toUpperCase() : req.body[field];
      }
    });

    if (updates.capacity !== undefined) {
      if (isNaN(updates.capacity) || updates.capacity < 1) {
        throw new AppError('Capacity must be a number ≥ 1', 400);
      }
      updates.capacity = Number(updates.capacity);
    }

    if (Object.keys(updates).length === 0) {
      throw new AppError('No valid fields provided to update', 400);
    }

    const table = await BranchRepository.findOneAndUpdateTable(
      { _id: req.params.id, merchant: req.user.merchant._id },
      updates,
      { new: true, runValidators: true }
    ).populate('branch');

    if (!table) {
      throw new AppError('Table not found or not authorized', 404);
    }

    try {
      const qrResult = await generateSecureQR(
        req.user.merchant._id,
        table.branch,
        table._id
      );

      table.qrCode = qrResult.qrImage;
      table.qrData = qrResult.data;
      table.qrSignature = qrResult.signature;
      table.qrUrl = qrResult.url;
      table.qrGeneratedAt = new Date();

      await table.save({ validateBeforeSave: false });

      return { table, qrFailed: false };
    } catch (qrError) {
      console.error('QR Regeneration failed:', qrError);
      return { table, qrFailed: true };
    }
  }

  static async deleteTable(req) {
    const table = await BranchRepository.findOneAndUpdateTable(
      { _id: req.params.id, merchant: req.user.merchant._id },
      { isActive: false },
      { new: true }
    );

    if (!table) throw new AppError('Table not found', 404);

    await BranchRepository.updateManyStaffAssignments(
      { 'tables.table': req.params.id, isActive: true },
      { isActive: false, endedAt: new Date() }
    );

    return table;
  }

  static async changeTable(req) {
    const { currentTableId, newTableId } = req.body;

    if (!currentTableId || !newTableId) {
      throw new AppError('Current and new table IDs are required', 400);
    }
    if (currentTableId === newTableId) {
      throw new AppError('Current and new table must be different', 400);
    }

    const currentTable = await BranchRepository.findTableOne({
      _id: currentTableId,
      merchant: req.user.merchant._id,
    });

    if (!currentTable) {
      throw new AppError('Current table not found or not authorized', 404);
    }

    return currentTable.changeTable(newTableId);
  }

  static async regenerateTableQr(req) {
    const tableId = req.params.id;
    const merchantId = req.user.merchant._id;

    const table = await BranchRepository.findTableOne({
      _id: tableId,
      merchant: merchantId,
      isActive: true,
    });

    if (!table) {
      throw new AppError('Table not found or inactive', 404);
    }

    const { qrImage, data, signature, url } = await generateSecureQR(
      merchantId,
      table.branch._id,
      tableId
    );

    table.qrCode = qrImage;
    table.qrData = data;
    table.qrSignature = signature;
    table.qrGeneratedAt = new Date();
    table.qrUrl = url;

    await table.save({ validateBeforeSave: false });

    return table;
  }

  static async getTablesByBranch(req) {
    const { id } = req.params;
    const merchantId = req.user.merchant._id;

    if (!id) {
      throw new AppError('Branch ID is required', 400);
    }

    const features = new ApiFeatures(
      BranchRepository.findTables({
        branch: id,
        merchant: merchantId,
        isActive: true,
      }),
      req.query
    )
      .filter()
      .sort()
      .limitFields()
      .paginate();

    return features.query.populate({
      path: 'branch',
      select: 'name branchCode isActive',
    });
  }

  /* ---------- Staff table assignments ---------- */

  static async assignTablesToStaff(req) {
    const { staffId, tableIds, section, shift = 'full-day', notes } = req.body;

    if (!staffId || !tableIds || !Array.isArray(tableIds) || tableIds.length === 0) {
      throw new AppError('Please provide staffId and array of tableIds', 400);
    }

    const staff = await BranchRepository.findUserOne({
      _id: staffId,
      merchant: req.user.merchant._id,
      isActive: true,
      role: { $exists: true },
    }).populate('role');

    if (!staff) {
      throw new AppError('Staff not found or not active', 404);
    }

    if (!staff.role) {
      throw new AppError('Staff has no role assigned', 400);
    }

    const role = await Role.findById(staff.role).populate('tasks');

    if (!role || !role.isActive) {
      throw new AppError('Staff role is invalid or inactive', 400);
    }

    const staffTaskNames = role.tasks.map(task => task.name?.toLowerCase()).filter(Boolean);

    const hasRequiredPermission = REQUIRED_TASKS_FOR_TABLE_ASSIGNMENT.some(required =>
      staffTaskNames.includes(required.toLowerCase())
    );

    if (!hasRequiredPermission) {
      throw new AppError(
        `Staff "${staff.name}" does not have permission to serve tables. ` +
          `Required tasks: ${REQUIRED_TASKS_FOR_TABLE_ASSIGNMENT.join(', ')}`,
        403
      );
    }

    const tables = await BranchRepository.findTables({
      _id: { $in: tableIds },
      merchant: req.user.merchant._id,
      isActive: true,
    });

    if (tables.length !== tableIds.length) {
      throw new AppError('One or more tables not found or not active', 400);
    }

    await BranchRepository.updateManyStaffAssignments(
      {
        merchant: req.user.merchant._id,
        'tables.table': { $in: tableIds },
        isActive: true,
      },
      { isActive: false, endedAt: new Date() }
    );

    const assignment = await BranchRepository.createStaffAssignment({
      merchant: req.user.merchant._id,
      staff: staffId,
      tables: tables.map(t => ({
        table: t._id,
        tableNumber: t.tableNumber,
      })),
      section,
      shift,
      notes,
      assignedBy: req.user._id,
      assignedAt: new Date(),
      isActive: true,
    });

    await assignment.populate([
      { path: 'staff', select: 'name phone avatar' },
      { path: 'assignedBy', select: 'name' },
      { path: 'tables.table', select: 'tableNumber capacity status location' },
    ]);

    return { assignment, staffName: staff.name };
  }

  static async getCurrentAssignments(req) {
    return BranchRepository.findStaffAssignments({
      merchant: req.user.merchant._id,
      isActive: true,
    })
      .populate('staff', 'name phone avatar')
      .populate('assignedBy', 'name')
      .populate('tables.table', 'tableNumber capacity status location')
      .sort('-assignedAt');
  }

  static async getAllAssignments(req) {
    const features = new ApiFeatures(
      BranchRepository.findStaffAssignments({ merchant: req.user.merchant._id }),
      req.query
    )
      .filter()
      .sort()
      .limitFields()
      .paginate();

    return features.query
      .populate('staff', 'name phone')
      .populate('assignedBy', 'name')
      .populate('tables.table', 'tableNumber');
  }

  static async endAssignment(req) {
    const assignment = await BranchRepository.findOneAndUpdateStaffAssignment(
      {
        _id: req.params.id,
        merchant: req.user.merchant._id,
        isActive: true,
      },
      { isActive: false, endedAt: new Date() },
      { new: true }
    );

    if (!assignment) {
      throw new AppError('No active assignment found', 404);
    }

    return assignment;
  }
}

module.exports = { BranchService };
