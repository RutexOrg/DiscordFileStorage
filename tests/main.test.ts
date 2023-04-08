import { FileStat, WebDAVClient, createClient } from "webdav"
import { assert } from "chai";
import { before, after, describe, it } from "mocha";
import DiscordFileStorageApp from "../src/DiscordFileStorageApp.js";
import { bootApp } from "../bootloader.js";
import sinon, { SinonStub } from "sinon";
import { Readable, Writable } from "stream";
import fs from "fs";
import path from "path";
import crypro from "crypto";
import axios from "../src/helper/AxiosInstance.js";
import { patchEmitter } from "../src/helper/EventPatcher.js";

const DOMAIN = "localhost";
const PORT = 3000;


function md5(buffer: Buffer) {
	return crypro.createHash("md5").update(buffer).digest("hex");
}

async function sleep(t: number){
    return new Promise((resolve, reject) => {
        setTimeout(resolve, t);
    })
}


async function fillWileWithData(sizeInBytes: number, stream: Writable) {
	return new Promise((resolve, reject) => {
			
		const buffer = Buffer.alloc(sizeInBytes);
		for (let i = 0; i < sizeInBytes; i++) {
			buffer[i] = Math.floor(Math.random() * 256);
		}
		stream.write(buffer);
		stream.on("finish", () => {
			resolve(true);
		});
		stream.on("error", (err) => {
			reject(err);
		});
		stream.end();
	});
}

function randomString(n: number = 16) {
	let result = "";
	const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	const charactersLength = characters.length;
	for (let i = 0; i < n; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return result;
}


function generateRandomString(n: number = 16) {
	let result = "";
	const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	const charactersLength = characters.length;
	for (let i = 0; i < n; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return result;
}

if(process.env["NODE_NO_WARNINGS"] == null) {
	console.warn("NODE_NO_WARNINGS is not set. This will cause warnings to be printed to the console. Set NODE_NO_WARNINGS=1 to suppress these warnings.");
}

process.on("unhandledRejection", (reason, promise) => {
	console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
	console.error("Uncaught Exception at:", err);
});



describe("DICloud basic functions test", function () {
	let fileLogStream: Writable = fs.createWriteStream("logs/console_log.log", {
		flags: "w+"
	});

	let logStub: SinonStub;
	let warnStub: SinonStub;

	before(() => {
		logStub = sinon.stub(console, "log").callsFake((...args) => {
			// remove escape codes
			args = args.map((arg) => {
				if(typeof arg !== "string") {
					return arg;
				}
				return arg.replace(/\x1b\[[0-9;]*m/g, "");
			});

			fileLogStream.write(args.join(" ") + "\n");
		});

		warnStub = sinon.stub(console, "warn");
	});

	after(() => {
		logStub.restore();
		warnStub.restore();
	});

	after(() => {
		setTimeout(() => {
			process.exit(0);
		}, 15000)
	})

	let server: DiscordFileStorageApp;

	// TODO: options
	let client: WebDAVClient;

	it("Prepares the test environment", async function () {
		if(fs.existsSync(".local")) {
			return true;
		}
		fs.mkdirSync(".local");
		assert.isTrue(fs.existsSync(".local"));
	});

		

	let localTestFolderName: string;
	let localGeneratedFilePath: string;
	it("Generate random file on a local filesystem", async function () {
		let randomLocalFolderName = randomString();
		localTestFolderName = randomLocalFolderName;
		let randomLocalFileName = randomString();
		fs.mkdirSync(path.join(".local", randomLocalFolderName), {recursive: true});
		localGeneratedFilePath = path.join(".local", randomLocalFolderName, randomLocalFileName + ".txt");
		
		await fillWileWithData(1024 * 1024 * 10, fs.createWriteStream(localGeneratedFilePath, {
			flags: "w"
		}));

		assert.isTrue(fs.existsSync(localGeneratedFilePath));
	});

	
	it("Start the server and check for any directory contents after boot to ensure server is up", async function () {
		this.timeout(10000);

		server = await bootApp();
		client = createClient(`http://${DOMAIN}:${PORT}`);

		assert.isArray(await client.getDirectoryContents("/"))
	});


	let remoteFolderName = generateRandomString();
	it("Create a remote temponary folder: " + remoteFolderName, async function () {
		await client.createDirectory(remoteFolderName);
		const content = (await client.getDirectoryContents("/") as FileStat[]).filter((file) => file.type === "directory");

		assert.equal(content.find((file) => file.basename === remoteFolderName) !== undefined, true);
	});

	it("Upload a local generated file to the remote", async function () {
		this.timeout(5000);
		return new Promise(async (resolve, reject) => {
			const fsReadableStream = fs.createReadStream(localGeneratedFilePath);

			const fileUploaded = await client.putFileContents(`${remoteFolderName}/testfile.txt`, fsReadableStream);
			await sleep(500);

			if(fileUploaded) {
				resolve();
			} else {
				reject();
			}
		});
	});

	it("Check if the remote file exists", async function () {
		const content = (await client.getDirectoryContents(remoteFolderName) as FileStat[]).filter((file) => file.type === "file");
		assert.equal(content.find((file) => file.basename === "testfile.txt") !== undefined, true);
	});


	let localRecreatedUploadedFile = path.join(".local", "testfile-downloaded.txt");
	it("Download remote created file: " + `${remoteFolderName}/testfile.txt`, async function () {
		this.timeout(10000);

		return new Promise(async (resolve, reject) => {
			client.createReadStream(`/${remoteFolderName}/testfile.txt`).pipe(fs.createWriteStream(localRecreatedUploadedFile)).on("finish", () => {
				resolve();
			});
		});
	});

	it("Download uploaded file via http", async function () {
		this.timeout(10000);
		return new Promise(async (resolve, reject) => {
			const content = (await client.getDirectoryContents(`/`) as FileStat[]).map(e => e.filename);
			console.dir(content);
			assert.isAbove(content.length, 0, "No files found in the root directory");


			let stream = await axios.get(`http://${DOMAIN}:${PORT}/${remoteFolderName}/testfile.txt`, {
				responseType: "stream"
			});

			stream.data.on("data", (data: any) => {
				(stream.data as Readable).destroy();
				resolve();
			});

			stream.data.on("error", (err: any) => {
				reject(err);
			});

		});
	});

	it("checks md5 hash of the original and downloaded file", async function () {
		const localFileMD5 = md5(fs.readFileSync(localGeneratedFilePath));
		const downloadedFileMD5 = md5(fs.readFileSync(localRecreatedUploadedFile));

		assert.equal(localFileMD5, downloadedFileMD5);
	});

	it("Delete a uploaded file from the server", async function () {
		await client.deleteFile(`${remoteFolderName}/testfile.txt`);

		let content = await client.getDirectoryContents(`/${remoteFolderName}`) as FileStat[];

		assert.equal(content.find((file) => file.basename === "testfile.txt") == undefined, true);
	});

	it("Delete a folder from the server", async function () {
		await client.deleteFile(`${remoteFolderName}`);

		let content = await client.getDirectoryContents(`/`) as FileStat[];
		assert.equal(content.find((file) => file.basename === remoteFolderName) == undefined, true);
	});

	it("Delete local created folder and files", async function () {

		let folder = path.join(".local", localTestFolderName);
		fs.rmSync(folder, { recursive: true });
		fs.unlinkSync(localRecreatedUploadedFile);

		assert.equal(fs.existsSync(localRecreatedUploadedFile), false, "local recreated file still exists");
		assert.equal(fs.existsSync(folder), false, "local test folder still exists");
	});


	it("Open stream to not existing file", async function () {
		this.timeout(5000);
		return new Promise((resolve, reject) => {
			let stream = client.createReadStream("not-existing-file.txt");
			stream.on("error", (err) => {
				resolve();
			});

			stream.on("data", (data) => {
				reject();
			});

		});
	});


	it("Open stream to not existing file in not existing folder", async function () {
		this.timeout(5000);
		return new Promise((resolve, reject) => {
			let stream = client.createReadStream("/not-existing-folder/test.txt");
			stream.on("error", (err) => {
				resolve();
			});

			stream.on("data", (data) => {
				reject();
			});

		});
	});

	

});