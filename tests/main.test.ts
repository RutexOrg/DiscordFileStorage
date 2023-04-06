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
import axios from "axios";

const DOMAIN = "localhost";
const PORT = 3000;


function md5(buffer: Buffer) {
	return crypro.createHash("md5").update(buffer).digest("hex");
}


async function fillWileWithData(sizeInBytes: number, stream: Writable) {
	const buffer = Buffer.alloc(sizeInBytes);
	for (let i = 0; i < sizeInBytes; i++) {
		buffer[i] = Math.floor(Math.random() * 256);
	}
	stream.write(buffer);
	stream.end();
}

async function generateTempFileInFs(sizeInBytes: number, filename: string): Promise<string> {
	const tmpDir = fs.mkdtempSync("tmp");
	const filePath = `${tmpDir}/${filename}`;
	const fileSize = 1024 * 1024 * 10; // 10 MB
	const writeStream = fs.createWriteStream(filePath);

	await fillWileWithData(fileSize, writeStream);

	return `${tmpDir}/${filename}`
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

describe("Discord File Storage unit tests", function () {

	let logStub: SinonStub;
	let warnStub: SinonStub;

	before(() => {
		logStub = sinon.stub(console, "log");
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

	it("Start the server and check for any directory contents after boot to ensure server is up", async function () {
		this.timeout(10000);

		server = await bootApp();
		client = createClient(`http://${DOMAIN}:${PORT}`);

		assert.isArray(await client.getDirectoryContents("/"))

	});

	let localRelativeFile: string;
	it("Generate random file on a local filesystem", async function () {
		let file = await generateTempFileInFs(1024 * 1024 * 10, "testfile.txt");
		localRelativeFile = file;

		console.log(process.cwd() + "/" + file);
		console.log(fs.existsSync(process.cwd() + "/" + file));

		assert.equal(fs.existsSync(process.cwd() + "/" + file), true);
	});

	let remoteFolderName = generateRandomString();
	it("Create a test folder: " + remoteFolderName, async function () {
		await client.createDirectory(remoteFolderName);
		const content = await client.getDirectoryContents("/") as FileStat[];

		assert.equal(content.find((file) => file.basename === remoteFolderName) !== undefined, true);
	});

	it("Upload a file to the server", async function () {
		this.timeout(5000);

			return new Promise((resolve, reject) => {
			
			const writableStream = client.createWriteStream(`${remoteFolderName}/testfile.txt`);
			const fsReadableStream = fs.createReadStream(localRelativeFile);

			fsReadableStream.pipe(writableStream);

			writableStream.once("finish", async () => {
				console.log("fsReadableStream end");

				let content = await client.getDirectoryContents(`/${remoteFolderName}`) as FileStat[];
			
				assert.equal(content.find((file) => file.basename === "testfile.txt") !== undefined, true);
				resolve();
			});
		});
	});

	
	it("Download a file from the server", async function () {
		this.timeout(5000);

		return new Promise((resolve, reject) => {
			const writableStream = fs.createWriteStream("testfile-downloaded.txt");

			const remoteReadableStream = client.createReadStream(`${remoteFolderName}/testfile.txt`);

			remoteReadableStream.pipe(writableStream);

			writableStream.once("finish", async () => {
				console.log("writableStream end");

				assert.equal(fs.existsSync("testfile-downloaded.txt"), true);
				resolve();
			});
		});
	});

	it("checks md5 hash of the original and downloaded file", async function () {
		const localFileMD5 = md5(fs.readFileSync(localRelativeFile));
		const downloadedFileMD5 = md5(fs.readFileSync("testfile-downloaded.txt"));

		assert.equal(localFileMD5, downloadedFileMD5);
	});

	it("Delete a file from the server", async function () {
		await client.deleteFile(`${remoteFolderName}/testfile.txt`);

		let content = await client.getDirectoryContents(`/${remoteFolderName}`) as FileStat[];

		assert.equal(content.find((file) => file.basename === "testfile.txt") == undefined, true);
	});

	it("Delete a folder from the server", async function () {
		await client.deleteFile(`${remoteFolderName}`);

		let content = await client.getDirectoryContents(`/`) as FileStat[];
		assert.equal(content.find((file) => file.basename === remoteFolderName) == undefined, true);
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

	it("Open stream to not existing folder", async function () {
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

	it("Tries to download some random file via http", async function () {
		this.timeout(10000);
		return new Promise(async (resolve, reject) => {
			const content = (await client.getDirectoryContents(`/`) as FileStat[]).filter(e => e.type === "file").map(e => e.filename);
			if(content.length === 0) {
				return reject("No files found");
			};


			const random = Math.floor(Math.random() * content.length);
			let stream = await axios.get(`http://${DOMAIN}:${PORT}${content[random]}`,{
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

});