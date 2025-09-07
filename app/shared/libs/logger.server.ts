import { createLogger as createWinstonLogger, format, transports } from 'winston'

const { combine, json, errors, timestamp } = format

export function createLogger(service = 'unitae-app') {
  return createWinstonLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: {
      service,
    },
    format: combine(errors({ stack: true }), timestamp(), json()),
    transports: [new transports.Console()],
  })
}

export const logger = createLogger('unitae-app')

export default logger
