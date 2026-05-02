const jwt  = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'توکن ارسال نشده' });
    }

    const token = header.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      const msg = jwtErr.name === 'TokenExpiredError'
        ? 'توکن منقضی شده — لطفاً دوباره وارد شوید'
        : 'توکن نامعتبر است';
      return res.status(401).json({ error: msg });
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ error: 'کاربر یافت نشد' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'خطا در احراز هویت' });
  }
};
