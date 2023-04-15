import crypro from "crypto";


export async function sleep(t: number) {
	return new Promise((resolve, reject) => {
		setTimeout(resolve, t);
	})
}

export function randomString(n: number = 16) {
	let result = "";
	const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	const charactersLength = characters.length;
	for (let i = 0; i < n; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return result;
}

export function md5(buffer: Buffer) {
	return crypro.createHash("md5").update(buffer).digest("hex");
}

export default function safeSetup(){
		
	process.on("unhandledRejection", (reason, promise) => {
		console.error("Unhandled Rejection at:", promise, "reason:", reason);
	});

	process.on("uncaughtException", (err) => {
		console.error("Uncaught Exception at:", err);
	});

}