export default class Log {
	public static info(message: any, ...args: any[]) {
		console.log(message, ...args)
	}

	static error(message: any, ...args: any[]) {
		console.error(message, ...args)
	}
}