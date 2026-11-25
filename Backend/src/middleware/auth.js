const supabase = require('../config/supabase');

// Checks the Supabase login token sent as:  Authorization: Bearer <access_token>
module.exports = async function requireAuth(req, res, next) {
  if (process.env.REQUIRE_AUTH === 'false') {
    req.user = { email: 'dev', name: 'Admin' };
    return next();
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Please log in.' });

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data || !data.user) return res.status(401).json({ error: 'Session expired. Please log in again.' });

    const u = data.user;
    req.user = {
      id: u.id,
      email: u.email,
      name: (u.user_metadata && (u.user_metadata.display_name || u.user_metadata.name)) || u.email
    };
    next();
  } catch (err) {
    next(err);
  }
};
