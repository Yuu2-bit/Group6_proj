const router = require('express').Router();
const C = require('../config/constants');

// Drop-down lists used by the frontend
router.get('/', (req, res) => res.json(C));

module.exports = router;
