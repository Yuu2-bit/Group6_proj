module.exports = function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || 'Server error';

  if (err.code === '23505') { status = 409; message = 'That record already exists (duplicate value).'; }
  else if (err.code === '23503') { status = 409; message = 'This record is linked to other records and cannot be changed or removed.'; }
  else if (err.code === '23514') { status = 400; message = 'A value is not allowed (check amounts and quantities).'; }
  else if (/INSUFFICIENT_STOCK/.test(message)) {
    status = 409;
    const left = (message.match(/INSUFFICIENT_STOCK:(\d+)/) || [])[1];
    message = left !== undefined ? 'Only ' + left + ' in stock.' : 'Not enough stock.';
  }
  else if (/ITEM_NOT_FOUND/.test(message)) { status = 404; message = 'Inventory item not found.'; }
  else if (/ITEM_INACTIVE/.test(message)) { status = 409; message = 'This item is inactive.'; }
  else if (/INVALID_(QUANTITY|TRANSACTION_TYPE)/.test(message)) { status = 400; message = 'Invalid stock movement.'; }

  if (status >= 500) {
    console.error(err);
    message = 'Internal server error.';
  }
  res.status(status).json({ error: message });
};