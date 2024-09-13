import dotenv from 'dotenv';
dotenv.config();

import * as uvu from 'uvu';
import * as assert from 'uvu/assert';

import { envBoot } from "../bootloader"
import DICloudApp from '../src/DICloudApp';
import { withResolvers } from '../src/helper/utils';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { Readable } from 'stream';
const test = uvu.test;

let app: DICloudApp;

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

test('server boot', async () => {
    app = await envBoot();
    assert.ok(app);
});


test("create and read small", async () => {
    const { promise, resolve, reject } = withResolvers();

    const provider = app.getProvider();
    const data = {
        name: "test.txt",
        content: "Hello world",
        size: 11
    }


    let readedContent = "";
    const file = provider.createVFile(data.name, data.size);
    const writeStream = await provider.createWriteStream(file);

    writeStream.on("finish", async () => {
        const readStream = await provider.createReadStream(file);
        readStream.on("data", (chunk) => {
            readedContent += chunk.toString();
        });

        readStream.on("end", () => {
            resolve(true);
        });

        readStream.on("error", (err) => {
            assert.not.ok(err);
        });
    });

    writeStream.write(Buffer.from(data.content));
    writeStream.end();
    // 

    await promise;

    assert.is(readedContent, data.content);
});

test("create and read big", async () => {
    const { promise, resolve, reject } = withResolvers();

    const provider = app.getProvider();
    const fileSize = 15_000_000; // 15MB

    const data = {
        name: "test-big.txt",
        content: Buffer.alloc(fileSize, 0).toString(),
        size: fileSize
    }

    let readedContent = "";
    const file = provider.createVFile(data.name, data.size);

    const writeStream = await provider.createWriteStream(file);

    writeStream.on("finish", async () => {
        const readStream = await provider.createReadStream(file);
        readStream.on("data", (chunk) => {
            readedContent += chunk.toString();
        });

        readStream.on("end", () => {
            resolve(true);
        });

        readStream.on("error", (err) => {
            assert.not.ok(err);
        });




    });

    Readable.from(data.content).pipe(writeStream);

    await promise;

    assert.is(readedContent, data.content);
});

test("create empty file", async () => {
    const { promise, resolve, reject } = withResolvers();

    const provider = app.getProvider();
    const data = {
        name: "empty.txt",
        content: "",
        size: 0
    }

    let readedContent = "";
    const file = provider.createVFile(data.name, data.size);

    const writeStream = await provider.createWriteStream(file);

    writeStream.on("finish", async () => {
        const readStream = await provider.createReadStream(file);
        readStream.on("data", (chunk) => {
            readedContent += chunk.toString();
        });

        readStream.on("end", () => {
            resolve(true);
        });

        readStream.on("error", (err) => {
            assert.not.ok(err);
        });
    });

    Readable.from(data.content).pipe(writeStream);

    await promise;

    assert.is(readedContent, data.content);
});



test.run();