const winston = require('winston');

const logger = winston.createLogger({
  level: 'info', // Set the default logging level
  format: winston.format.combine(
    winston.format.timestamp(), // Add timestamps to logs
    winston.format.simple() // Format logs as JSON
  ),
  transports: [
    new winston.transports.Console(), // Log to console
    new winston.transports.File({ filename: 'error.log', level: 'error' }), // Log errors to a file
  ],
});

module.exports = logger;
