const jwt = require('jsonwebtoken');

function secret() {
  return process.env.JWT_SECRET;
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.fullname, email: user.email, role: user.role },
    secret(),
    { expiresIn: '8h' }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Please log in first.' });
  }
  try {
    req.user = jwt.verify(token, secret());
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do this.' });
    }
    next();
  };
}

module.exports = { signToken, auth, requireRole };
