/**
 * middleware/validate.js — Request validation helpers
 *
 * Usage in routes:
 *   const { body, param, query, handle } = require('../middleware/validate');
 *
 *   router.post('/', auth, [
 *     body('id').notEmpty(),
 *     body('name').trim().notEmpty().isLength({ max: 128 }),
 *     body('age').isInt({ min: 0, max: 120 }),
 *     handle,
 *   ], async (req, res) => { ... });
 */

const { body, param, query, validationResult } = require('express-validator');

/** Middleware: collect validation errors and return 400 if any */
function handle(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error:  'Validation failed',
      fields: errors.array().map(e => ({ field: e.path, msg: e.msg })),
    });
  }
  next();
}

/** Standard page/limit query params with defaults */
function paginationRules() {
  return [
    query('page').optional().isInt({ min: 1 }).toInt().withMessage('page must be ≥ 1'),
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt().withMessage('limit must be 1–200'),
  ];
}

/** Orphan body validation rules */
function orphanRules() {
  return [
    body('id').trim().notEmpty().withMessage('id الزامی است'),
    body('name').trim().notEmpty().isLength({ max: 128 }).withMessage('نام الزامی و حداکثر ۱۲۸ حرف'),
    body('age').optional().isInt({ min: 0, max: 120 }).withMessage('سن باید بین ۰ تا ۱۲۰ باشد'),
    body('mobile').optional().matches(/^\d{0,15}$/).withMessage('موبایل فقط ارقام'),
    body('status').optional().isIn(['Healthy','Disabled','Chronic']).withMessage('وضعیت نامعتبر'),
    body('studenttype').optional().isIn(['orphan','needy']).withMessage('نوع نامعتبر'),
    body('priority').optional().isIn(['very_worthy','worthy','average','']).withMessage('اولویت نامعتبر'),
    body('role').not().exists().withMessage('role مجاز نیست'),  // prevent privilege escalation
  ];
}

/** Sponsor body validation rules */
function sponsorRules() {
  return [
    body('id').trim().notEmpty().withMessage('id الزامی است'),
    body('name').trim().notEmpty().isLength({ max: 128 }).withMessage('نام الزامی'),
    body('phone').optional().matches(/^\d{0,20}$/).withMessage('شماره نامعتبر'),
    body('type').optional().isIn(['individual','organization','family','']),
  ];
}

module.exports = { body, param, query, handle, paginationRules, orphanRules, sponsorRules };
