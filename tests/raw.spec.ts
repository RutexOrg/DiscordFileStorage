import dotenv from 'dotenv';
dotenv.config();

import * as uvu from 'uvu';
import * as assert from 'uvu/assert';

import { envBoot } from "../bootloader"
import DICloudApp from '../src/DICloudApp';
import { withResolvers } from '../src/helper/utils';
const test = uvu.test;

let app: DICloudApp;

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

test('server boot', async () => {
    app = await envBoot();
    assert.ok(app);
});


test("create and read file", async () => {
    const { promise, resolve, reject } = withResolvers();

    const provider = app.getProvider();
    const data = {
        name: "test.txt",
        content: "Hello world",
        size: 11
    }


    let readedContent = "";
    const file = provider.createVFile("test.txt", 4);
    const writeStream = await provider.createWriteStream(file, {
        onFinished: async () => {
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
        }
    });
    writeStream.write(Buffer.from(data.content));
    writeStream.end();

    await promise;

    assert.is(readedContent, data.content);



});



test.run();