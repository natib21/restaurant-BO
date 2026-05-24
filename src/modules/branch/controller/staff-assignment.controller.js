const catchAsync = require('../../../../utils/catchAsync');
const { BranchService } = require('../service/BranchService');

exports.assignTablesToStaff = catchAsync(async (req, res) => {
  const { assignment, staffName } = await BranchService.assignTablesToStaff(req);

  res.status(201).json({
    status: 'success',
    message: `Tables successfully assigned to ${staffName}`,
    data: { assignment },
  });
});

exports.getCurrentAssignments = catchAsync(async (req, res) => {
  const assignments = await BranchService.getCurrentAssignments(req);

  res.status(200).json({
    status: 'success',
    results: assignments.length,
    data: { assignments },
  });
});

exports.getAllAssignments = catchAsync(async (req, res) => {
  const assignments = await BranchService.getAllAssignments(req);

  res.status(200).json({
    status: 'success',
    results: assignments.length,
    data: { assignments },
  });
});

exports.endAssignment = catchAsync(async (req, res) => {
  const assignment = await BranchService.endAssignment(req);

  res.status(200).json({
    status: 'success',
    data: { assignment },
  });
});
