const moment = require('moment');
const winston = require('winston');

/**
 * Centralized logger that uses Winston 2.x.
 *
 * Note:
 * updating to 3.x will require code changes.
 *
 * Usage:
 * const log = require('./logger')
 * log.info('Some info!')
 * log.error('An error:', error)
 * ...etc
 *
 * Valid LOG_LEVEL:
 * error, warn, info, verbose, debug, silly.
 */

const defaultLog = winston.loggers.add('default', {
  transports: [
    new winston.transports.Console({
      level: process.env.LOG_LEVEL || 'info',
      formatter: info => {
        return `${moment().format('DD-MM-YYYY HH:mm:ss')} ${info.level}: ${info.message}`;
      }
    })
  ]
});

module.exports = defaultLog;
