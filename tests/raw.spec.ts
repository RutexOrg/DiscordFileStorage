import dotenv from 'dotenv';
dotenv.config();

import * as uvu from 'uvu';
import * as assert from 'uvu/assert';

import { envBoot } from "../bootloader"
import DICloudApp from '../src/DICloudApp';

const test = uvu.test;

let app: DICloudApp;
let encryptionOffset = 0;

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


test('server boot', async () => {
    app = await envBoot();

    if (app.shouldEncryptFiles()) {
        encryptionOffset = 16 // hardcoded for now, TODO: get later
    }

    assert.ok(app);
});


test("create and read small file", async () => {
    const data = {
        name: "test-small.txt",
        content: "Hello, World!",
        size: 0
    }
    data.size = Buffer.byteLength(data.content);

    const buffer = Buffer.from(data.content);
    const uploadedFile = await app.uploadFile(buffer, data.name);
    assert.is(uploadedFile.size - encryptionOffset, data.size);

    const downloadedBuffer = await app.downloadFile(uploadedFile);
    assert.is(downloadedBuffer.toString(), data.content);
});

test("create and read big", async () => {
    const fileSize = 15_000_000; // 15MB

    const data = {
        name: "test-big.txt",
        content: Buffer.alloc(fileSize, 0).toString(),
        size: 0
    }
    data.size = Buffer.byteLength(data.content);

    const buffer = Buffer.from(data.content);
    const uploadedFile = await app.uploadFile(buffer, data.name);
    assert.is(uploadedFile.size - (encryptionOffset * uploadedFile.chunks.length), data.size);

    const downloadedBuffer = await app.downloadFile(uploadedFile);
    assert.is(downloadedBuffer.toString(), data.content);
});

test("create and read empty file", async () => {
    const data = {
        name: "empty.txt",
        content: "",
        size: 0
    }
    data.size = Buffer.byteLength(data.content);

    const buffer = Buffer.from(data.content);
    const uploadedFile = await app.uploadFile(buffer, data.name);
    assert.is(uploadedFile.size, 0);

    const downloadedBuffer = await app.downloadFile(uploadedFile);
    assert.is(downloadedBuffer.toString(), data.content);

});



test.run();