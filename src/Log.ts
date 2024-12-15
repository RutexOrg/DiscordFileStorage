import path from "path"
import util from "util"
import { createLogger, format, transports, config } from "winston"
import fs from "fs"

export default class Log {

	private static logger = createLogger(setup("dicloud", true))
	

	public static info(message: any, ...args: any[]) {
		Log.logger.info(message, args);
	}

	static error(message: any, ...args: any[]) {
		Log.logger.error(message, args);
	}
}

export function setup(loggerName: string, logToConsole: boolean = true) {
	if (!loggerName) {
		throw new Error("!loggerName")
	}

	// thx to https://github.com/winstonjs/winston/issues/1427#issuecomment-540417212
	const logger = {
		levels: config.syslog.levels,
		format: format.combine(
			format.timestamp(),
			format.printf((info: any) => {
				const timestamp = info.timestamp.trim();
				const level = info.level;
				const message = (info && info.message ? info.message : "")
				const args = info[Symbol.for('splat')];
				const strArgs = (args || []).map((arg: any) => {
					return util.inspect(arg, {
						// colors: true
					});
				}).join(' ');
				return `[${timestamp}] ${level} ${message} ${strArgs}`;
			})
		),

		transports: [] as any[]
	}

	if(process.env.FILE_LOGGING_ENABLED) {
		if(!fs.existsSync(path.join(process.cwd(), "logs"))) {
			fs.mkdirSync(path.join(process.cwd(), "logs"))
		}

		logger.transports.push(new transports.File({filename: path.join(process.cwd(), "logs", loggerName + ".log")}))
	}

	if (logToConsole) {
		logger.transports.push(new transports.Console())
	}

	return logger
}

export function make(loggerName: string, logToConsole: boolean = true) {
	return createLogger(setup(loggerName, logToConsole))
}