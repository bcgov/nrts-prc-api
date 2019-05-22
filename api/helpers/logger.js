const moment = require('moment');
const winston = require('winston');

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
