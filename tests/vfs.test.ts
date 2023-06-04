import { assert } from "chai";
import { before, after, describe, it } from "mocha";
import sinon, { SinonStub } from "sinon";
import { Readable, Writable } from "stream";
import fs from "fs";
import safeSetup from "./helper.js";
import Folder, { VirtualFS } from "../src/file/filesystem/Folder.js";
import RamFile from "../src/file/RamFile.js";


safeSetup();


describe("DICloud VFS basic functions test", function () {

	let root = new VirtualFS().getRoot();


	describe("Checks basics VFS function", function () {

		it(`Check new created vfs root is /`, function () {
			assert.equal(root.getAbsolutePath(), "/");
		});

		it("creates a new folder /a/", function () {
			const folder = root.createFolder("a");
			assert.equal(folder.getAbsolutePath(), "/a/");
		});

		it("creates a new folder /c/d/", function () {
			const folder = root.createFolderHierarchy("/c/d/");
			assert.equal(folder.getAbsolutePath(), "/c/d/");
		});

		it("creates a new folder /c/d/e/", function () {
			const folder = root.createFolderHierarchy("/c/d/e/");
			assert.equal(folder.getAbsolutePath(), "/c/d/e/");
		});

		it("get folder by path /c/d/e/", function () {
			let folder = root.getFolderByPath("/c/d/e/");
			assert.equal(folder?.getAbsolutePath(), "/c/d/e/");
		});

		it("Creates a ramfile /c/d/e/hello.txt", function(){
			let f = root.createRAMFileHierarchy("/c/d/e/", "hello.txt", new Date());
			assert.equal(f.getAbsolutePath(), "/c/d/e/hello.txt");
		});

		it("checks if /c/d/e/hello.txt exists", function(){
			let entry = root.getEntryByPath("/c/d/e/hello.txt");
			assert.equal(entry.isFile && entry.entry?.getEntryName(), "hello.txt");
		});

		let testContent = "Hello World!";
		it("checks ram file write", async function(){
			let enry = root.getEntryByPath("/c/d/e/hello.txt");
			if(!enry.isFile) throw new Error("Entry is not a file");

			let file = enry.entry as RamFile;

			let writeStream = file.getWritable();
			Readable.from(testContent).pipe(writeStream).once("finish", () => {
				assert.equal(file.getSize(), testContent.length);
			}).once("error", (err) => {
				throw err;
			});
		});

		it("checks ram file read", async function(){
			let enry = root.getEntryByPath("/c/d/e/hello.txt");
			if(!enry.isFile) throw new Error("Entry is not a file");

			let file = enry.entry as RamFile;

			let readStream = file.getReadable();
			let data = "";
			readStream.on("data", (chunk) => {
				data += chunk;
			}).once("end", () => {
				assert.equal(data, testContent);
			}).once("error", (err) => {
				throw err;
			});
		});

		it("checks rename /c/d/e/hello.txt to /c/d/e/hello2.txt", function(){
			let entry = root.getEntryByPath("/c/d/e/hello.txt");
			if(!entry.isFile) throw new Error("Entry is not a file");

			let file = entry.entry as RamFile;
			file.setFileName("hello2.txt");
			assert.equal(file.getAbsolutePath(), "/c/d/e/hello2.txt");
		});

	})



});