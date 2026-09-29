/*
import winston from "winston";

const logger = globalThis.process ? winston.createLogger({
  level: 'debug',
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  ]
}) : console;

export default logger;*/

const logger = console;

export default logger;
